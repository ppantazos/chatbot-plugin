# 🚀 Quick Start - Local Development

## One-Command Setup (Easiest!)

### Windows:
```powershell
.\start.ps1
```

### Linux/Mac:
```bash
chmod +x start.sh
./start.sh
```

Or use Docker directly:
```bash
docker-compose up -d
```

## What Happens?

1. ✅ Starts WordPress container on `http://localhost:8080`
2. ✅ Starts MySQL database
3. ✅ Mounts your plugin automatically
4. ✅ Opens WordPress in your browser

## First Time Setup

1. **Complete WordPress Installation**
   - Visit: http://localhost:8080
   - Follow the WordPress setup wizard
   - Database credentials are already configured:
     - Database: `wordpress`
     - Username: `wordpress`
     - Password: `wordpress`
     - Host: `db` (already set)

2. **Activate Plugin**
   - Go to: Plugins → Installed Plugins
   - Find "SellEmbedded Chatbot"
   - Click "Activate"

3. **Configure Plugin**
   - Go to: Settings → SellEmbedded Chatbot
   - Enter your API key
   - Save settings

## Commands

### Start:
```powershell
.\start.ps1
```

### Stop:
```powershell
.\stop.ps1
```

### View Logs:
```bash
docker-compose logs -f
```

### Restart:
```bash
docker-compose restart
```

### Clean Start (removes all data):
```bash
docker-compose down -v
.\start.ps1
```

## Troubleshooting

### Port Already in Use?
Edit `docker-compose.yml` and change `8080:80` to `8081:80` (or any free port)

### Docker Not Running?
- Windows: Start Docker Desktop
- Mac: Start Docker Desktop
- Linux: `sudo systemctl start docker`

### Plugin Not Appearing?
- Make sure the plugin folder is mounted correctly
- Check: `docker-compose exec wordpress ls -la /var/www/html/wp-content/plugins/`

### Database Connection Issues?
- Wait 30-60 seconds after starting (MySQL needs time to initialize)
- Check logs: `docker-compose logs db`

## Requirements

- Docker Desktop installed and running
- Ports 8080 and 3306 available

That's it! 🎉

