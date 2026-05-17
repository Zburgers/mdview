# Legacy Python GTK App

The original `mdview` app was a Python GTK/WebKitGTK Markdown editor with live
preview, local Mermaid rendering, open/save, copy HTML, export PDF, and optional
sync scrolling.

It is being replaced because the old public install path depended on shell
scripts and Linux desktop integration details. That approach created avoidable
risk around local icon themes, desktop entries, dependency managers, Python
packages, and distro-specific GTK/WebKit dependencies.

The legacy implementation remains in the repository as reference material while
Tauri v2 becomes the preferred packaged app path.
