# Appearance Settings

## Goal

Provide one Appearance settings section for application theme, UI font size, code presentation preferences, and the Windows window effect across desktop, Web, and mobile Web.

## Settings

- App theme: System, Light, or Dark, using the existing theme preference and cross-window synchronization.
- UI font size (Chinese label: `界面字号`): a numeric input from 12px through 20px, default 14px. The preference drives the dedicated `text-ui-*` scale through `--ui-font-size` without changing the root `html` font size.
- Window effect (Chinese label: `窗口特效`): Windows-only select with Default, Acrylic, and Mica. It changes the DWM material behind the sidebar and the panel gutter while the content area stays opaque. See `docs/desktop/windows-window-effect.md`.
- Code presentation: light and dark syntax themes, line numbers, long-line wrapping, and an independent numeric code font-size input from 12px through 20px.
- Code settings and code preview are stacked vertically. Inside code preview, the light and dark preview cards use a side-by-side layout on `sm` screens and fall back to one card per row below that breakpoint.

## Boundaries

- UI font size and code font size are persisted independently.
- Code and diff rendering continues to consume `codePreviewSettings.fontSizePx`; it does not inherit the root UI `rem` size.
- The integrated terminal retains its own font configuration and is not controlled by either Appearance font-size setting.
- UI font-size changes are applied through `--ui-font-size`, persisted, and synchronized between application windows without mutating `document.documentElement.style.fontSize`.
- The window effect is a Windows desktop setting persisted in `setting.json`; it does not appear on macOS, Linux, Web, mobile Web, Windows 10, or Windows 11 builds below 22H2.
- The window effect changes only the `DesktopWindowFrame` root surface (sidebar and panel gutter). Content frames keep their opaque `bg-background` surface.
- The former Code Preview navigation target is replaced by Appearance. A stored legacy `codePreview` target resolves to Appearance.

## Copy

- The interface subsection title is `界面设置` in Chinese and `Interface Setting` in English.
- Describe visible outcomes instead of implementation details such as `rem`, root font size, or UI scaling.
- Interface font-size copy states that icons and layout dimensions do not change with text size.
- Window-effect copy states that the sidebar and window edges change while the content area stays opaque, and lists Default, Acrylic, and Mica without promising platform internals.
- Code preference copy covers code blocks, file previews, and diff views rather than only the preview cards on this settings page.
- The light and dark preview cards are displayed together below the controls; copy must not describe them as a single viewer on the right.

## Verification

- Verify Appearance is listed after General and the separate Code Preview navigation item is removed.
- Verify General retains language and system behavior settings but no longer duplicates app theme.
- Verify theme, UI font size, and code presentation controls render together under Appearance.
- Verify both font sizes use numeric inputs rather than drag sliders, and commit on Enter or blur.
- Verify Code settings stays above Code preview, while the light / dark preview cards sit side by side at `sm` layouts and render one card per row below that breakpoint.
- Verify UI font size persistence, clamping, and cross-window synchronization without root DOM font-size mutation.
- Verify the window effect row appears only on supported Windows builds; switching Default / Acrylic / Mica changes the sidebar and panel gutter transparency while the content frame stays opaque.
- Run `pnpm typecheck`, `pnpm lint`, and relevant UI tests.
