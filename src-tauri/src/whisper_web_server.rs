use serde::Serialize;
use std::{
    env,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    time::Duration,
};
use whisper_rs::{
    FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState,
};

const HOST: &str = "127.0.0.1:8788";
const SAMPLE_RATE: usize = 16_000;
const DEFAULT_MODEL_PATH: &str =
    "Library/Application Support/com.luke.teleprompter/models/ggml-base.bin";

#[derive(Serialize)]
struct HealthResponse {
    state: &'static str,
    engine: &'static str,
}

#[derive(Serialize)]
struct TranscriptionResponse {
    text: String,
    language: String,
    confidence: f32,
}

#[derive(Serialize)]
struct ErrorResponse {
    message: String,
}

struct HttpRequest {
    method: String,
    target: String,
    body: Vec<u8>,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let model_path = env::var_os("LUKE_WHISPER_MODEL")
        .map(PathBuf::from)
        .unwrap_or_else(default_model_path);
    if !model_path.exists() {
        return Err(format!(
            "找不到 Whisper base 模型：{}。请先启动 Luke Teleprompter 下载模型，或设置 LUKE_WHISPER_MODEL。",
            model_path.display()
        )
        .into());
    }

    eprintln!("正在加载本地 Whisper base：{}", model_path.display());
    let context = WhisperContext::new_with_params(
        model_path.to_string_lossy().as_ref(),
        WhisperContextParameters::default(),
    )?;
    let mut state = context.create_state()?;
    let listener = TcpListener::bind(HOST)?;
    eprintln!("Luke Whisper 网页服务已就绪：http://{HOST}");

    for connection in listener.incoming() {
        match connection {
            Ok(stream) => {
                if let Err(error) = handle_connection(stream, &mut state) {
                    eprintln!("网页识别请求失败：{error}");
                }
            }
            Err(error) => eprintln!("网页服务连接失败：{error}"),
        }
    }
    Ok(())
}

fn default_model_path() -> PathBuf {
    env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default()
        .join(DEFAULT_MODEL_PATH)
}

fn handle_connection(
    mut stream: TcpStream,
    state: &mut WhisperState,
) -> Result<(), Box<dyn std::error::Error>> {
    stream.set_read_timeout(Some(Duration::from_secs(30)))?;
    let request = read_request(&mut stream)?;
    match (request.method.as_str(), request.target.as_str()) {
        ("OPTIONS", _) => write_response(&mut stream, 204, None, ""),
        ("GET", "/health") => write_json(
            &mut stream,
            200,
            &HealthResponse {
                state: "ready",
                engine: "whisper.cpp base + Metal",
            },
        ),
        ("POST", target) if target.starts_with("/transcribe") => {
            let prompt = query_value(target, "prompt").unwrap_or_default();
            let language = query_value(target, "language").unwrap_or_else(|| "auto".into());
            match transcribe(state, &request.body, &prompt, &language) {
                Ok(response) => write_json(&mut stream, 200, &response),
                Err(message) => write_json(&mut stream, 400, &ErrorResponse { message }),
            }
        }
        _ => write_json(
            &mut stream,
            404,
            &ErrorResponse {
                message: "未找到请求路径。".into(),
            },
        ),
    }
}

fn transcribe(
    state: &mut WhisperState,
    body: &[u8],
    prompt: &str,
    language: &str,
) -> Result<TranscriptionResponse, String> {
    let samples = decode_f32_pcm(body)?;
    if samples.len() < SAMPLE_RATE / 2 {
        return Err("音频片段过短。".into());
    }

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 3 });
    params.set_n_threads(4);
    params.set_translate(false);
    params.set_language(match language {
        "chinese" => Some("zh"),
        "english" => Some("en"),
        _ => None,
    });
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_single_segment(false);
    params.set_no_context(true);
    params.set_initial_prompt(prompt);
    state
        .full(params, &samples)
        .map_err(|error| format!("Whisper 推理失败：{error}"))?;

    let mut text = String::new();
    for index in 0..state.full_n_segments() {
        if let Some(segment) = state.get_segment(index) {
            if let Ok(segment_text) = segment.to_str_lossy() {
                text.push_str(&segment_text);
            }
        }
    }
    Ok(TranscriptionResponse {
        text: text.trim().into(),
        language: language.into(),
        confidence: 0.8,
    })
}

fn decode_f32_pcm(body: &[u8]) -> Result<Vec<f32>, String> {
    if body.len() % 4 != 0 {
        return Err("音频数据格式不正确。".into());
    }
    Ok(body
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect())
}

fn read_request(stream: &mut TcpStream) -> Result<HttpRequest, Box<dyn std::error::Error>> {
    let mut raw = Vec::new();
    let mut buffer = [0_u8; 8192];
    let header_end;
    loop {
        let read = stream.read(&mut buffer)?;
        if read == 0 {
            return Err("请求在发送完成前断开。".into());
        }
        raw.extend_from_slice(&buffer[..read]);
        if let Some(index) = raw.windows(4).position(|window| window == b"\r\n\r\n") {
            header_end = index + 4;
            break;
        }
        if raw.len() > 64 * 1024 {
            return Err("请求头过大。".into());
        }
    }

    let header = std::str::from_utf8(&raw[..header_end])?;
    let mut header_lines = header.split("\r\n");
    let request_line = header_lines.next().ok_or("缺少请求行。")?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().ok_or("缺少请求方法。")?.to_owned();
    let target = request_parts.next().ok_or("缺少请求路径。")?.to_owned();
    let content_length = header_lines
        .find_map(|line| {
            line.split_once(':')
                .filter(|(key, _)| key.eq_ignore_ascii_case("content-length"))
        })
        .map(|(_, value)| value.trim().parse::<usize>())
        .transpose()?
        .unwrap_or(0);
    if content_length > SAMPLE_RATE * 5 * 4 + 64 * 1024 {
        return Err("音频片段过大。".into());
    }

    while raw.len() - header_end < content_length {
        let read = stream.read(&mut buffer)?;
        if read == 0 {
            return Err("音频数据未完整上传。".into());
        }
        raw.extend_from_slice(&buffer[..read]);
    }
    Ok(HttpRequest {
        method,
        target,
        body: raw[header_end..header_end + content_length].to_vec(),
    })
}

fn query_value(target: &str, key: &str) -> Option<String> {
    target.split_once('?')?.1.split('&').find_map(|part| {
        let (name, value) = part.split_once('=')?;
        (name == key).then(|| percent_decode(value))
    })
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex(bytes[index + 1]), hex(bytes[index + 2])) {
                output.push(high * 16 + low);
                index += 3;
                continue;
            }
        }
        output.push(if bytes[index] == b'+' {
            b' '
        } else {
            bytes[index]
        });
        index += 1;
    }
    String::from_utf8_lossy(&output).into_owned()
}

fn hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn write_json<T: Serialize>(
    stream: &mut TcpStream,
    status: u16,
    body: &T,
) -> Result<(), Box<dyn std::error::Error>> {
    write_response(
        stream,
        status,
        Some("application/json; charset=utf-8"),
        &serde_json::to_string(body)?,
    )
}

fn write_response(
    stream: &mut TcpStream,
    status: u16,
    content_type: Option<&str>,
    body: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let status_text = match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        404 => "Not Found",
        _ => "Internal Server Error",
    };
    let content_type = content_type.unwrap_or("text/plain; charset=utf-8");
    write!(
        stream,
        "HTTP/1.1 {status} {status_text}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )?;
    stream.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_little_endian_pcm() {
        let body = [0.0_f32.to_le_bytes(), 0.5_f32.to_le_bytes()].concat();
        assert_eq!(decode_f32_pcm(&body).unwrap(), vec![0.0, 0.5]);
    }

    #[test]
    fn decodes_percent_encoded_prompt() {
        assert_eq!(
            query_value("/transcribe?prompt=%E4%BD%A0%E5%A5%BD+world", "prompt"),
            Some("你好 world".into())
        );
    }
}
