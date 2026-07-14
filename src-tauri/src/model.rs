use futures_util::StreamExt;
use reqwest::header::RANGE;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{AppHandle, Emitter};
use tokio::{fs, io::AsyncWriteExt};

pub const MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";
pub const MODEL_SIZE: u64 = 147_951_465;
pub const MODEL_SHA256: &str = "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub state: String,
    pub path: Option<String>,
    pub size: u64,
    pub expected_size: u64,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProgress {
    pub downloaded: u64,
    pub total: u64,
    pub state: String,
    pub message: Option<String>,
}

#[derive(Clone)]
pub struct ModelManager {
    model_dir: PathBuf,
    cancel: Arc<AtomicBool>,
    downloading: Arc<AtomicBool>,
}

impl ModelManager {
    pub fn new(model_dir: PathBuf) -> Self {
        Self {
            model_dir,
            cancel: Arc::new(AtomicBool::new(false)),
            downloading: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn model_path(&self) -> PathBuf {
        self.model_dir.join("ggml-base.bin")
    }

    fn partial_path(&self) -> PathBuf {
        self.model_dir.join("ggml-base.bin.part")
    }

    fn marker_path(&self) -> PathBuf {
        self.model_dir.join("ggml-base.bin.sha256")
    }

    pub fn status(&self) -> ModelStatus {
        let model_path = self.model_path();
        let size = std::fs::metadata(&model_path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        let verified = size == MODEL_SIZE
            && std::fs::read_to_string(self.marker_path())
                .map(|value| value.trim() == MODEL_SHA256)
                .unwrap_or(false);

        ModelStatus {
            state: if self.downloading.load(Ordering::SeqCst) {
                "downloading".into()
            } else if verified {
                "ready".into()
            } else {
                "missing".into()
            },
            path: verified.then(|| model_path.to_string_lossy().into_owned()),
            size,
            expected_size: MODEL_SIZE,
            message: None,
        }
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    pub async fn download(&self, app: AppHandle) -> Result<(), String> {
        if self
            .downloading
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Ok(());
        }

        self.cancel.store(false, Ordering::SeqCst);
        let result = self.download_inner(&app).await;
        self.downloading.store(false, Ordering::SeqCst);

        if let Err(error) = &result {
            let _ = app.emit(
                "model-download-progress",
                ModelProgress {
                    downloaded: std::fs::metadata(self.partial_path())
                        .map(|metadata| metadata.len())
                        .unwrap_or(0),
                    total: MODEL_SIZE,
                    state: "error".into(),
                    message: Some(error.clone()),
                },
            );
        }
        result
    }

    async fn download_inner(&self, app: &AppHandle) -> Result<(), String> {
        fs::create_dir_all(&self.model_dir)
            .await
            .map_err(|error| format!("无法创建模型目录：{error}"))?;

        let partial_path = self.partial_path();
        let mut existing = fs::metadata(&partial_path)
            .await
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        if existing > MODEL_SIZE {
            fs::remove_file(&partial_path).await.ok();
            existing = 0;
        }

        let client = reqwest::Client::builder()
            .user_agent("Luke-Teleprompter/0.1")
            .build()
            .map_err(|error| format!("无法初始化下载：{error}"))?;
        let mut request = client.get(MODEL_URL);
        if existing > 0 {
            request = request.header(RANGE, format!("bytes={existing}-"));
        }
        let response = request
            .send()
            .await
            .map_err(|error| format!("无法连接模型服务器：{error}"))?;

        let append = response.status() == reqwest::StatusCode::PARTIAL_CONTENT && existing > 0;
        if !response.status().is_success() {
            return Err(format!("模型服务器返回状态 {}", response.status()));
        }
        if !append {
            existing = 0;
        }

        let mut options = fs::OpenOptions::new();
        options.create(true).write(true);
        if append {
            options.append(true);
        } else {
            options.truncate(true);
        }
        let mut file = options
            .open(&partial_path)
            .await
            .map_err(|error| format!("无法写入模型文件：{error}"))?;
        let mut downloaded = existing;
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            if self.cancel.load(Ordering::SeqCst) {
                file.flush().await.ok();
                let _ = app.emit(
                    "model-download-progress",
                    ModelProgress {
                        downloaded,
                        total: MODEL_SIZE,
                        state: "cancelled".into(),
                        message: None,
                    },
                );
                return Ok(());
            }
            let chunk = chunk.map_err(|error| format!("下载中断：{error}"))?;
            file.write_all(&chunk)
                .await
                .map_err(|error| format!("写入模型失败：{error}"))?;
            downloaded += chunk.len() as u64;
            let _ = app.emit(
                "model-download-progress",
                ModelProgress {
                    downloaded,
                    total: MODEL_SIZE,
                    state: "downloading".into(),
                    message: None,
                },
            );
        }
        file.flush()
            .await
            .map_err(|error| format!("保存模型失败：{error}"))?;

        if downloaded != MODEL_SIZE {
            return Err(format!("模型大小不正确：{downloaded} / {MODEL_SIZE}"));
        }

        let _ = app.emit(
            "model-download-progress",
            ModelProgress {
                downloaded,
                total: MODEL_SIZE,
                state: "verifying".into(),
                message: None,
            },
        );

        let hash_path = partial_path.clone();
        let actual_hash = tokio::task::spawn_blocking(move || sha256_file(&hash_path))
            .await
            .map_err(|error| format!("模型校验任务失败：{error}"))?
            .map_err(|error| format!("无法校验模型：{error}"))?;
        if actual_hash != MODEL_SHA256 {
            fs::remove_file(&partial_path).await.ok();
            return Err("模型 SHA-256 校验失败，已删除损坏文件。".into());
        }

        fs::rename(&partial_path, self.model_path())
            .await
            .map_err(|error| format!("无法安装模型：{error}"))?;
        fs::write(self.marker_path(), MODEL_SHA256)
            .await
            .map_err(|error| format!("无法保存校验标记：{error}"))?;

        let _ = app.emit(
            "model-download-progress",
            ModelProgress {
                downloaded: MODEL_SIZE,
                total: MODEL_SIZE,
                state: "ready".into(),
                message: None,
            },
        );
        Ok(())
    }
}

fn sha256_file(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(0))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn hashes_files_consistently() {
        let path = std::env::temp_dir().join("luke-teleprompter-hash-test.txt");
        let mut file = File::create(&path).unwrap();
        file.write_all(b"teleprompter").unwrap();
        drop(file);
        assert_eq!(
            sha256_file(&path).unwrap(),
            "feefcfe63515be208e977dabc94052c41e46d0cca717d89e8b8f766c9e13317d"
        );
        std::fs::remove_file(path).ok();
    }
}
