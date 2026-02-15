# How to Activate the Plugin in WordPress

## Quick Steps

### 1. Access WordPress Admin
- Open your browser and go to: **http://localhost:8080**
- If this is your first time, complete the WordPress installation wizard
- Log in to WordPress admin dashboard

### 2. Activate the Plugin
1. In WordPress admin, go to: **Plugins → Installed Plugins**
2. Look for **"SellEmbedded Chatbot"** in the list
3. Click the **"Activate"** button

### 3. Configure the Plugin
1. After activation, go to: **Settings → SellEmbedded Chatbot**
2. Enter your API key
3. Click **"Save Changes"**

### 4. Verify It's Working
- The chatbot should appear on your WordPress site
- Check the frontend of your site to see the chatbot widget

## Troubleshooting

### Plugin Not Showing Up?

**Check if plugin is mounted correctly:**
```powershell
docker exec sellembedded-chatbot-wordpress-1 ls -la /var/www/html/wp-content/plugins/
```

You should see `sellembedded-chatbot` folder listed.

**If plugin folder is missing:**
1. Stop containers: `.\stop.ps1`
2. Make sure you're in the plugin directory
3. Restart: `.\start.ps1`

**Check plugin files:**
```powershell
docker exec sellembedded-chatbot-wordpress-1 ls -la /var/www/html/wp-content/plugins/sellembedded-chatbot/
```

You should see `index.php` and other plugin files.

### Plugin Shows Error After Activation?

**Check WordPress debug log:**
```powershell
docker exec sellembedded-chatbot-wordpress-1 cat /var/www/html/wp-content/debug.log
```

**Common issues:**
- Missing `vendor/autoload.php` - Run `composer install` in the plugin directory
- PHP version too old - WordPress container uses PHP 8.x, should be fine
- Permissions issue - Docker handles this automatically

### Manual Installation (Alternative)

If the Docker mount isn't working, you can manually copy the plugin:

1. **Copy plugin to WordPress:**
```powershell
docker cp . sellembedded-chatbot-wordpress-1:/var/www/html/wp-content/plugins/sellembedded-chatbot
```

2. **Set permissions:**
```powershell
docker exec sellembedded-chatbot-wordpress-1 chown -R www-data:www-data /var/www/html/wp-content/plugins/sellembedded-chatbot
```

3. **Refresh WordPress plugins page**

## Plugin Location in Docker

The plugin is mounted at:
```
/var/www/html/wp-content/plugins/sellembedded-chatbot
```

This maps to your local directory:
```
C:\Users\Panos\Desktop\petya\sellembedded-chatbot
```

Any changes you make locally will be reflected immediately in WordPress (no need to restart containers).

## Next Steps After Activation

1. ✅ Plugin activated
2. ✅ API key configured
3. ✅ Test the chatbot on your site frontend
4. ✅ Customize settings if needed
5. ✅ Check browser console for any JavaScript errors

## Need Help?

- Check WordPress admin → Tools → Site Health for any issues
- View container logs: `docker-compose logs -f wordpress`
- Check plugin settings page for error messages

