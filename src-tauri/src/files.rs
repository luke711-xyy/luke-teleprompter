use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct OpenedTextFile {
    pub path: String,
    pub content: String,
}

pub async fn open_text_file() -> Result<Option<OpenedTextFile>, String> {
    tokio::task::spawn_blocking(|| {
        let Some(path) = rfd::FileDialog::new()
            .add_filter("Text", &["txt"])
            .set_title("打开提词文稿")
            .pick_file()
        else {
            return Ok(None);
        };
        let bytes = std::fs::read(&path).map_err(|error| format!("无法读取文件：{error}"))?;
        let content = String::from_utf8(bytes)
            .map_err(|_| "文件不是有效的 UTF-8 TXT，请先转换编码。".to_string())?;
        Ok(Some(OpenedTextFile {
            path: path.to_string_lossy().into_owned(),
            content: content.trim_start_matches('\u{feff}').to_string(),
        }))
    })
    .await
    .map_err(|error| format!("打开文件任务失败：{error}"))?
}

pub async fn save_text_file(
    content: String,
    suggested_name: Option<String>,
) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        let default_name = suggested_name.unwrap_or_else(|| "提词稿.txt".to_string());
        let Some(path) = rfd::FileDialog::new()
            .add_filter("Text", &["txt"])
            .set_file_name(default_name)
            .set_title("保存提词文稿")
            .save_file()
        else {
            return Ok(None);
        };
        std::fs::write(&path, content.as_bytes())
            .map_err(|error| format!("无法保存文件：{error}"))?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|error| format!("保存文件任务失败：{error}"))?
}
