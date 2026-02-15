# Development Guide - Seeing Your Changes

## Quick Reference

| What You Changed | What To Do | Refresh Needed? |
|-----------------|------------|-----------------|
| **PHP files** | Nothing! Changes are immediate | Hard refresh (Ctrl+F5) |
| **JavaScript in `assets/js/`** | Nothing! Changes are immediate | Hard refresh (Ctrl+F5) |
| **CSS files** | Nothing! Changes are immediate | Hard refresh (Ctrl+F5) |
| **Server (Node.js)** | Restart server | N/A |
| **Build for production** | Run `npm run build` | Hard refresh |

## Detailed Instructions

### 1. WordPress Plugin Changes (PHP, JavaScript, CSS)

**Good News:** Since the plugin is mounted as a Docker volume, **all changes are immediate!**

#### PHP Files (`src/`, `templates/`, `index.php`)
- ✅ Edit files directly
- ✅ Changes appear immediately
- 🔄 **Hard refresh** WordPress page: `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)

#### JavaScript Files (`assets/js/`)
- ✅ Edit files directly in `assets/js/main.js` or other JS files
- ✅ The plugin automatically uses `assets/js/main.js` if `dist/main.js` doesn't exist
- 🔄 **Hard refresh** WordPress page: `Ctrl+F5`

**Note:** The plugin checks for `dist/main.js` first, but falls back to `assets/js/main.js`. For development, you can work directly in `assets/js/` without building!

#### CSS Files (`assets/css/style.css`)
- ✅ Edit `assets/css/style.css` directly
- ✅ Changes appear immediately
- 🔄 **Hard refresh** WordPress page: `Ctrl+F5`

### 2. Server Changes (Node.js/TypeScript)

**Location:** `C:\Users\Panos\Petya\server\`

#### If using nodemon (auto-restart):
```bash
cd C:\Users\Panos\Petya\server
npm run dev  # or whatever your dev script is
```
- ✅ Changes are detected automatically
- ✅ Server restarts automatically

#### If running manually:
```bash
# Stop the server (Ctrl+C)
# Then restart:
npm start
```

**After server restart:**
- ✅ API changes are live immediately
- 🔄 Refresh your WordPress page

### 3. Building JavaScript for Production

**Only needed when:**
- You want to minify/optimize JavaScript
- You're preparing a release/zip file
- You want to use the built version instead of source

```bash
cd C:\Users\Panos\Desktop\petya\sellembedded-chatbot
npm run build
```

This creates `dist/main.js` (minified/bundled version).

**To use the built version:**
- The plugin automatically prefers `dist/main.js` if it exists
- After building, hard refresh WordPress: `Ctrl+F5`

**To go back to source files:**
- Delete `dist/main.js` or run `npm run clean`
- Plugin will automatically use `assets/js/main.js`

## Development Workflow

### Recommended Setup:

1. **For WordPress Plugin Development:**
   ```bash
   # Work directly in assets/js/ - no build needed!
   # Edit: assets/js/main.js
   # Refresh browser: Ctrl+F5
   ```

2. **For Server Development:**
   ```bash
   # In server directory, use nodemon or watch mode
   cd C:\Users\Panos\Petya\server
   npm run dev  # Auto-restarts on changes
   ```

3. **Before Committing/Releasing:**
   ```bash
   # Build optimized JavaScript
   cd C:\Users\Panos\Desktop\petya\sellembedded-chatbot
   npm run build
   ```

## Troubleshooting

### Changes Not Appearing?

1. **Hard refresh browser:** `Ctrl+F5` or `Ctrl+Shift+R`
2. **Clear browser cache:** DevTools → Network → Disable cache
3. **Check Docker volume mount:**
   ```powershell
   docker exec sellembedded-chatbot-wordpress-1 ls -la /var/www/html/wp-content/plugins/sellembedded-chatbot/assets/js/
   ```
4. **Restart WordPress container** (rarely needed):
   ```powershell
   docker-compose restart wordpress
   ```

### JavaScript Changes Not Working?

1. **Check browser console** for errors (F12)
2. **Verify file is being loaded:**
   - Open DevTools → Network tab
   - Refresh page
   - Look for `main.js` - check if it's loading from `assets/js/` or `dist/`
3. **Check file version:** The plugin uses `filemtime()` for cache busting, so changes should be picked up automatically

### Server Changes Not Working?

1. **Check if server restarted:**
   - Look for "Server running..." message in terminal
2. **Check server logs** for errors
3. **Verify CORS:** Make sure `http://localhost:8080` is in allowed origins (already fixed!)

## Quick Commands Cheat Sheet

```powershell
# WordPress Plugin Directory
cd C:\Users\Panos\Desktop\petya\sellembedded-chatbot

# Build JavaScript (optional, for production)
npm run build

# Clean build files
npm run clean

# Server Directory
cd C:\Users\Panos\Petya\server

# Restart server (if not using nodemon)
# Ctrl+C to stop, then:
npm start

# Docker Commands
.\start.ps1          # Start WordPress
.\stop.ps1           # Stop WordPress
docker-compose restart wordpress  # Restart WordPress only
```

## Pro Tips

1. **Use browser DevTools:**
   - Keep DevTools open (F12)
   - Enable "Disable cache" in Network tab during development
   - Use Console tab to see JavaScript errors

2. **File Watching (Optional):**
   - Install a file watcher to auto-build: `npm install -g nodemon`
   - Or use VS Code's built-in file watcher

3. **Development vs Production:**
   - **Development:** Work in `assets/js/` - no build needed
   - **Production:** Run `npm run build` before deploying

4. **Cache Busting:**
   - The plugin uses `filemtime()` automatically
   - Each file change gets a new version number
   - No manual cache clearing needed!

