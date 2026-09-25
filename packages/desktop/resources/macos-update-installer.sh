#!/bin/sh
# ZCodex 未签名构建的自更新脚本（macOS）。
#
# 为什么需要它：未签名/ad-hoc 构建装不上 Squirrel 更新，应用自己也做不到「覆盖正在运行的
# 自己的 bundle」。所以由登录用户的 shell 接手：等旧进程退出 → 挂载下载好的 DMG →
# 把新 app 复制到同卷暂存目录 → 原子替换原 bundle → 重新打开新版本。
#
# 用法（由主进程 spawn，参数一律用绝对路径）：
#   macos-update-installer.sh <旧进程pid> <bundle路径> <dmg路径> <日志路径>
#
# 退出码：0 成功；非 0 失败（此时会打开 DMG 并重新拉起旧版本，日志里有原因）。
set -u

if [ "$#" -lt 4 ]; then
  echo "usage: macos-update-installer.sh <pid> <bundle-path> <dmg-path> <log-path>" >&2
  exit 2
fi

OLD_PID="$1"
BUNDLE_PATH="$2"
DMG_PATH="$3"
LOG_PATH="$4"

# 等旧进程退出：替换 bundle 前它必须完全消失，否则会覆盖失败或留下半旧半新的 app。
WAIT_TIMEOUT_SECONDS=60
WAIT_POLL_SECONDS=0.2
# 轮询次数按秒换算，别把 tick 数当成秒数比较（那样超时会缩短 5 倍）。
WAIT_TIMEOUT_TICKS=$((WAIT_TIMEOUT_SECONDS * 5))
# 替换前把旧 bundle 改名备份，新 bundle 移动失败时用它回滚。
BACKUP_PATH="${BUNDLE_PATH}.old"
# 暂存目录必须和 bundle 同卷：跨卷 mv 会退化成 ditto 复制，期间断电就只剩半份 app。
BUNDLE_DIR=$(dirname "$BUNDLE_PATH")
STAGING_PATH="${BUNDLE_DIR}/.ZCodex-update-staging.app"
MOUNT_PATH=""

log() {
  printf '%s [update-install] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG_PATH"
}

cleanup_mount() {
  if [ -n "$MOUNT_PATH" ]; then
    hdiutil detach "$MOUNT_PATH" -quiet >>"$LOG_PATH" 2>&1 || true
    rm -rf "$MOUNT_PATH"
    MOUNT_PATH=""
  fi
}

# 失败时的兜底：日志留证据，打开 DMG 让用户手动拖，再把旧版本拉起来，
# 免得用户只看到应用消失、既不知道原因也没有下一步。
fail() {
  log "failed: $*"
  cleanup_mount
  rm -rf "$STAGING_PATH"
  if [ -d "$BUNDLE_PATH" ]; then
    open "$BUNDLE_PATH" >>"$LOG_PATH" 2>&1 || true
  elif [ -d "$BACKUP_PATH" ]; then
    mv "$BACKUP_PATH" "$BUNDLE_PATH" >>"$LOG_PATH" 2>&1 || true
    open "$BUNDLE_PATH" >>"$LOG_PATH" 2>&1 || true
  fi
  if [ -f "$DMG_PATH" ]; then
    open "$DMG_PATH" >>"$LOG_PATH" 2>&1 || true
  fi
  exit 1
}

log "start oldPid=${OLD_PID} bundle=${BUNDLE_PATH} dmg=${DMG_PATH}"

[ -d "$BUNDLE_PATH" ] || fail "bundle not found: ${BUNDLE_PATH}"
[ -f "$DMG_PATH" ] || fail "installer not found: ${DMG_PATH}"

ticks=0
while kill -0 "$OLD_PID" 2>/dev/null; do
  if [ "$ticks" -ge "$WAIT_TIMEOUT_TICKS" ]; then
    fail "timed out after ${WAIT_TIMEOUT_SECONDS}s waiting for pid ${OLD_PID} to exit"
  fi
  sleep "$WAIT_POLL_SECONDS"
  ticks=$((ticks + 1))
done
log "old process exited after ~$((ticks / 5))s"

MOUNT_PATH=$(mktemp -d "${TMPDIR:-/tmp}/zcodex-update-mount.XXXXXX") || fail "cannot create mount point"
# 显式指定挂载点：DMG 自带卷名（例如 "ZCodex 1.1.1-arm64"）带空格，解析 hdiutil 输出很容易踩坑。
hdiutil attach -nobrowse -readonly -quiet -mountpoint "$MOUNT_PATH" "$DMG_PATH" >>"$LOG_PATH" 2>&1 ||
  fail "cannot mount ${DMG_PATH}"
log "mounted at ${MOUNT_PATH}"

SOURCE_APP=""
for candidate in "$MOUNT_PATH"/*.app; do
  if [ -d "$candidate" ]; then
    SOURCE_APP="$candidate"
    break
  fi
done
[ -n "$SOURCE_APP" ] || fail "no .app inside ${DMG_PATH}"
log "installer app: ${SOURCE_APP}"

rm -rf "$STAGING_PATH"
ditto "$SOURCE_APP" "$STAGING_PATH" >>"$LOG_PATH" 2>&1 || fail "cannot copy app out of the dmg"
# 只认 Info.plist 里声明的可执行文件，别猜名字：Preview/Dev 包的 productName 与正式版不同。
INSTALLER_EXECUTABLE=$(defaults read "$STAGING_PATH/Contents/Info.plist" CFBundleExecutable 2>/dev/null)
if [ -z "$INSTALLER_EXECUTABLE" ] || [ ! -x "$STAGING_PATH/Contents/MacOS/$INSTALLER_EXECUTABLE" ]; then
  fail "copied app looks incomplete (executable=${INSTALLER_EXECUTABLE:-none})"
fi
cleanup_mount
log "staged at ${STAGING_PATH}"

rm -rf "$BACKUP_PATH"
mv "$BUNDLE_PATH" "$BACKUP_PATH" >>"$LOG_PATH" 2>&1 || fail "cannot move current bundle aside"
if ! mv "$STAGING_PATH" "$BUNDLE_PATH" >>"$LOG_PATH" 2>&1; then
  # 回滚：旧 bundle 还在 .old，先把它放回原位，用户至少还能启动旧版本。
  mv "$BACKUP_PATH" "$BUNDLE_PATH" >>"$LOG_PATH" 2>&1 || true
  fail "cannot move new bundle into place (rolled back)"
fi
rm -rf "$BACKUP_PATH"
log "replaced bundle"

# 未签名构建从下载来的 DMG 复制出来后仍可能带隔离标记，直接启动会被 Gatekeeper 拦下。
xattr -dr com.apple.quarantine "$BUNDLE_PATH" >>"$LOG_PATH" 2>&1 || true

if open "$BUNDLE_PATH" >>"$LOG_PATH" 2>&1; then
  log "relaunched ${BUNDLE_PATH}"
  exit 0
fi
fail "cannot relaunch ${BUNDLE_PATH}"
