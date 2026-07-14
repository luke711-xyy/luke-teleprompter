#[cfg(target_os = "macos")]
use std::{sync::mpsc, time::Duration};

#[cfg(target_os = "macos")]
use block2::RcBlock;
#[cfg(target_os = "macos")]
use objc2::{class, msg_send, runtime::Bool};
#[cfg(target_os = "macos")]
use objc2_foundation::NSString;

#[cfg(target_os = "macos")]
const AV_AUTHORIZATION_STATUS_NOT_DETERMINED: isize = 0;
#[cfg(target_os = "macos")]
const AV_AUTHORIZATION_STATUS_RESTRICTED: isize = 1;
#[cfg(target_os = "macos")]
const AV_AUTHORIZATION_STATUS_DENIED: isize = 2;
#[cfg(target_os = "macos")]
const AV_AUTHORIZATION_STATUS_AUTHORIZED: isize = 3;

#[cfg(target_os = "macos")]
pub fn request_microphone_permission() -> Result<(), String> {
    let media_type = NSString::from_str("soun");
    let status: isize = unsafe {
        msg_send![
            class!(AVCaptureDevice),
            authorizationStatusForMediaType: &*media_type
        ]
    };

    match status {
        AV_AUTHORIZATION_STATUS_AUTHORIZED => Ok(()),
        AV_AUTHORIZATION_STATUS_DENIED => Err(denied_message()),
        AV_AUTHORIZATION_STATUS_RESTRICTED => {
            Err("系统限制了麦克风访问。请检查屏幕使用时间、企业配置或隐私限制。".into())
        }
        AV_AUTHORIZATION_STATUS_NOT_DETERMINED => request_undetermined_permission(&media_type),
        _ => Err(format!("无法确认麦克风权限状态：{status}")),
    }
}

#[cfg(target_os = "macos")]
fn request_undetermined_permission(media_type: &NSString) -> Result<(), String> {
    let (sender, receiver) = mpsc::channel();
    let completion: RcBlock<dyn Fn(Bool)> = RcBlock::new(move |granted: Bool| {
        let _ = sender.send(granted.as_bool());
    });

    unsafe {
        let _: () = msg_send![
            class!(AVCaptureDevice),
            requestAccessForMediaType: media_type,
            completionHandler: &*completion
        ];
    }

    match receiver.recv_timeout(Duration::from_secs(60)) {
        Ok(true) => Ok(()),
        Ok(false) => Err(denied_message()),
        Err(_) => {
            Err("等待麦克风授权超时。请重新点击开始测试，或到系统设置中检查麦克风权限。".into())
        }
    }
}

#[cfg(target_os = "macos")]
fn denied_message() -> String {
    "麦克风权限未开启。请到 系统设置 > 隐私与安全性 > 麦克风，允许 Luke Teleprompter，然后重启应用。".into()
}

#[cfg(not(target_os = "macos"))]
pub fn request_microphone_permission() -> Result<(), String> {
    Ok(())
}
