use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use serde::Serialize;
use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecognitionStateEvent {
    pub state: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecognitionResultEvent {
    pub text: String,
    pub detected_language: String,
    pub confidence: f32,
    pub is_final: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecognitionLevelEvent {
    pub level: f32,
    pub is_speech: bool,
}

#[derive(Debug, Clone, Copy)]
struct RecognitionEvents {
    state: &'static str,
    result: &'static str,
    level: Option<&'static str>,
}

impl RecognitionEvents {
    fn follow() -> Self {
        Self {
            state: "recognition-state",
            result: "recognition-result",
            level: None,
        }
    }

    fn microphone_test() -> Self {
        Self {
            state: "microphone-test-state",
            result: "microphone-test-result",
            level: Some("microphone-test-level"),
        }
    }
}

#[derive(Default)]
pub struct RecognitionController {
    cancel: Mutex<Option<Arc<AtomicBool>>>,
}

impl RecognitionController {
    pub fn start(&self, app: AppHandle, model_path: PathBuf, prompt: String) -> Result<(), String> {
        self.start_with_events(app, model_path, prompt, RecognitionEvents::follow())
    }

    pub fn start_microphone_test(&self, app: AppHandle, model_path: PathBuf) -> Result<(), String> {
        self.start_with_events(
            app,
            model_path,
            String::new(),
            RecognitionEvents::microphone_test(),
        )
    }

    fn start_with_events(
        &self,
        app: AppHandle,
        model_path: PathBuf,
        prompt: String,
        events: RecognitionEvents,
    ) -> Result<(), String> {
        self.stop();
        if !model_path.exists() {
            return Err("本地语音模型尚未准备好。".into());
        }
        let cancel = Arc::new(AtomicBool::new(false));
        *self.cancel.lock() = Some(cancel.clone());

        thread::Builder::new()
            .name("teleprompter-recognition".into())
            .spawn(move || {
                if let Err(error) =
                    run_recognition(app.clone(), model_path, prompt, cancel.clone(), events)
                {
                    let _ = app.emit(
                        events.state,
                        RecognitionStateEvent {
                            state: "error".into(),
                            message: Some(error),
                        },
                    );
                }
            })
            .map_err(|error| format!("无法启动识别线程：{error}"))?;
        Ok(())
    }

    pub fn stop(&self) {
        if let Some(cancel) = self.cancel.lock().take() {
            cancel.store(true, Ordering::SeqCst);
        }
    }
}

fn run_recognition(
    app: AppHandle,
    model_path: PathBuf,
    prompt: String,
    cancel: Arc<AtomicBool>,
    events: RecognitionEvents,
) -> Result<(), String> {
    let _ = app.emit(
        events.state,
        RecognitionStateEvent {
            state: "loading".into(),
            message: Some("正在加载本地模型".into()),
        },
    );

    let context = WhisperContext::new_with_params(
        model_path.to_string_lossy().as_ref(),
        WhisperContextParameters::default(),
    )
    .map_err(|error| format!("无法加载 Whisper 模型：{error}"))?;
    let mut whisper_state = context
        .create_state()
        .map_err(|error| format!("无法创建识别状态：{error}"))?;

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "没有找到可用麦克风，请检查系统声音输入设置。".to_string())?;
    let supported = device
        .default_input_config()
        .map_err(|error| format!("无法读取麦克风格式：{error}"))?;
    let sample_rate = supported.sample_rate();
    let channels = supported.channels() as usize;
    let config: cpal::StreamConfig = supported.clone().into();
    let max_samples = sample_rate as usize * 7;
    let audio = Arc::new(Mutex::new(VecDeque::<f32>::with_capacity(max_samples)));
    let error_app = app.clone();
    let stream_error = move |error| {
        let _ = error_app.emit(
            events.state,
            RecognitionStateEvent {
                state: "error".into(),
                message: Some(format!("麦克风输入中断：{error}")),
            },
        );
    };

    let stream = match supported.sample_format() {
        cpal::SampleFormat::F32 => {
            let buffer = audio.clone();
            device.build_input_stream(
                &config,
                move |data: &[f32], _| push_f32(data, channels, &buffer, max_samples),
                stream_error,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let buffer = audio.clone();
            device.build_input_stream(
                &config,
                move |data: &[i16], _| push_i16(data, channels, &buffer, max_samples),
                stream_error,
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let buffer = audio.clone();
            device.build_input_stream(
                &config,
                move |data: &[u16], _| push_u16(data, channels, &buffer, max_samples),
                stream_error,
                None,
            )
        }
        format => return Err(format!("暂不支持麦克风采样格式 {format:?}")),
    }
    .map_err(|error| format!("无法访问麦克风，请在系统设置中允许提词器使用麦克风：{error}"))?;

    stream
        .play()
        .map_err(|error| format!("无法启动麦克风：{error}"))?;
    let _ = app.emit(
        events.state,
        RecognitionStateEvent {
            state: "listening".into(),
            message: Some("中文 / English 本地识别中".into()),
        },
    );

    let mut last_text = String::new();
    let mut last_inference = Instant::now() - Duration::from_millis(1000);
    let mut last_signal = Instant::now();
    let mut no_input_reported = false;
    while !cancel.load(Ordering::SeqCst) {
        thread::sleep(Duration::from_millis(250));
        if cancel.load(Ordering::SeqCst) {
            break;
        }

        let raw = {
            let buffer = audio.lock();
            let wanted = (sample_rate as usize * 5).min(buffer.len());
            buffer
                .iter()
                .skip(buffer.len() - wanted)
                .copied()
                .collect::<Vec<_>>()
        };
        if raw.is_empty() {
            continue;
        }
        let recent_start = raw.len().saturating_sub((sample_rate as usize / 4).max(1));
        let recent_rms = rms(&raw[recent_start..]);
        let is_speech = recent_rms >= 0.008;
        if recent_rms >= 0.001 {
            last_signal = Instant::now();
            if no_input_reported {
                no_input_reported = false;
                let _ = app.emit(
                    events.state,
                    RecognitionStateEvent {
                        state: "listening".into(),
                        message: Some("检测到麦克风输入，正在识别".into()),
                    },
                );
            }
        } else if !no_input_reported && last_signal.elapsed() >= Duration::from_secs(3) {
            no_input_reported = true;
            let _ = app.emit(
                events.state,
                RecognitionStateEvent {
                    state: "listening".into(),
                    message: Some(
                        "没有收到麦克风输入。请检查系统麦克风权限和声音输入设备。".into(),
                    ),
                },
            );
        }
        if let Some(level_event) = events.level {
            let _ = app.emit(
                level_event,
                RecognitionLevelEvent {
                    level: normalized_level(recent_rms),
                    is_speech,
                },
            );
        }
        if raw.len() < sample_rate as usize
            || !is_speech
            || last_inference.elapsed() < Duration::from_millis(1000)
        {
            continue;
        }
        last_inference = Instant::now();

        let samples = resample_linear(&raw, sample_rate, 16_000);
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_n_threads(4);
        params.set_translate(false);
        params.set_language(None);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_single_segment(true);
        params.set_no_context(false);
        params.set_initial_prompt(&prompt);

        if let Err(error) = whisper_state.full(params, &samples) {
            let _ = app.emit(
                events.state,
                RecognitionStateEvent {
                    state: "error".into(),
                    message: Some(format!("语音识别失败：{error}")),
                },
            );
            continue;
        }

        let mut text = String::new();
        let segments = whisper_state.full_n_segments();
        for index in 0..segments {
            if let Some(segment) = whisper_state.get_segment(index) {
                if let Ok(segment_text) = segment.to_str_lossy() {
                    text.push_str(&segment_text);
                }
            }
        }
        let text = text.trim().to_string();
        if text.is_empty() || text == last_text {
            continue;
        }
        last_text.clone_from(&text);
        let _ = app.emit(
            events.result,
            RecognitionResultEvent {
                text,
                detected_language: "auto".into(),
                confidence: 0.8,
                is_final: true,
            },
        );
    }

    drop(stream);
    let _ = app.emit(
        events.state,
        RecognitionStateEvent {
            state: "idle".into(),
            message: None,
        },
    );
    Ok(())
}

fn push_f32(data: &[f32], channels: usize, buffer: &Mutex<VecDeque<f32>>, max: usize) {
    push_mono(
        data.chunks(channels)
            .map(|frame| frame.iter().sum::<f32>() / channels as f32),
        buffer,
        max,
    );
}

fn push_i16(data: &[i16], channels: usize, buffer: &Mutex<VecDeque<f32>>, max: usize) {
    push_mono(
        data.chunks(channels).map(|frame| {
            frame
                .iter()
                .map(|value| *value as f32 / i16::MAX as f32)
                .sum::<f32>()
                / channels as f32
        }),
        buffer,
        max,
    );
}

fn push_u16(data: &[u16], channels: usize, buffer: &Mutex<VecDeque<f32>>, max: usize) {
    push_mono(
        data.chunks(channels).map(|frame| {
            frame
                .iter()
                .map(|value| (*value as f32 / u16::MAX as f32) * 2.0 - 1.0)
                .sum::<f32>()
                / channels as f32
        }),
        buffer,
        max,
    );
}

fn push_mono(samples: impl Iterator<Item = f32>, buffer: &Mutex<VecDeque<f32>>, max: usize) {
    let mut buffer = buffer.lock();
    for sample in samples {
        buffer.push_back(sample);
    }
    while buffer.len() > max {
        buffer.pop_front();
    }
}

fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    (samples.iter().map(|sample| sample * sample).sum::<f32>() / samples.len() as f32).sqrt()
}

fn normalized_level(value: f32) -> f32 {
    (value * 18.0).clamp(0.0, 1.0)
}

pub fn resample_linear(input: &[f32], source_rate: u32, target_rate: u32) -> Vec<f32> {
    if input.is_empty() || source_rate == 0 || target_rate == 0 {
        return Vec::new();
    }
    if source_rate == target_rate {
        return input.to_vec();
    }
    let output_len = ((input.len() as u64 * target_rate as u64) / source_rate as u64) as usize;
    let ratio = source_rate as f64 / target_rate as f64;
    let mut output = Vec::with_capacity(output_len);
    for index in 0..output_len {
        let position = index as f64 * ratio;
        let left = position.floor() as usize;
        let right = (left + 1).min(input.len() - 1);
        let fraction = (position - left as f64) as f32;
        output.push(input[left] * (1.0 - fraction) + input[right] * fraction);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resamples_to_expected_length() {
        let input = vec![0.0_f32; 48_000];
        assert_eq!(resample_linear(&input, 48_000, 16_000).len(), 16_000);
    }

    #[test]
    fn silence_has_zero_rms() {
        assert_eq!(rms(&[0.0; 128]), 0.0);
        assert!(rms(&[0.2; 128]) > 0.19);
    }

    #[test]
    fn normalizes_microphone_level() {
        assert_eq!(normalized_level(0.0), 0.0);
        assert!(normalized_level(0.02) > 0.0);
        assert_eq!(normalized_level(2.0), 1.0);
    }
}
