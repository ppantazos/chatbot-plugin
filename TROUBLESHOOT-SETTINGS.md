# Settings Page – OpenAI Key Not Appearing

If the **OpenAI API Key** field doesn't show on Settings → Chatbot settings:

## 1. Confirm files were updated

Check that the Registrar contains the new setting:

```powershell
# From project root
Select-String -Path "src\Settings\Registrar.php" -Pattern "OPENAI"
```

You should see `SETTING_OPENAI_API_KEY` and the OpenAI field registration.

## 2. Docker: ensure plugin is mounted

If using Docker, the plugin is mounted from your project folder. Any edits there should apply immediately.

Check the file inside the container:

```powershell
docker exec -it chatbot-plugin-wordpress-1 cat /var/www/html/wp-content/plugins/sellembedded-chatbot/src/Settings/Registrar.php | findstr OPENAI
```

(Container name may differ – use `docker ps` to see it.)

## 3. Clear caches

- **Browser:** Hard refresh the settings page (Ctrl+Shift+R).
- **WordPress caching:** Clear cache from your caching plugin (if any).
- **PHP opcache:** Restart the web server or PHP container:
  ```powershell
  docker restart chatbot-plugin-wordpress-1
  ```

## 4. Re-register the plugin

1. Plugins → deactivate **SellEmbedded Chatbot**
2. Reactivate it
3. Go to Settings → Chatbot settings again

## 5. Check for PHP errors

Enable debug logging in `wp-config.php`:

```php
define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);
```

Reload the settings page and check `wp-content/debug.log` for errors.

## 6. Workarounds: add OpenAI key

If the settings field doesn’t appear, you can test the flow by adding the option directly (adjust path as needed):

```powershell
docker exec -it chatbot-plugin-wordpress-1 wp option update avatar-openai-api-key 'sk-proj-YOUR_ACTUAL_KEY' --path=/var/www/html --allow-root
```

**Option A – wp-config.php:** Add before `/* That's all, stop editing! */` in wp-config.php:
```php
define('CHATBOT_OPENAI_API_KEY', 'sk-proj-YOUR_ACTUAL_KEY');
```

Then hard-refresh the chatbot page. Replace `YOUR_ACTUAL_KEY` with your full OpenAI key.
