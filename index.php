<?php

declare(strict_types=1);

/**
 * Plugin Name: SellEmbedded Chatbot
 * Description: Integrates with SellEmbedded Chatbot.
 * Version:     1.1.0
 * License:     GPLv2+
 */

namespace Avatar\AvatarIntegration;

use Inpsyde\Modularity\Package;
use Inpsyde\Modularity\Properties\PluginProperties;
use Throwable;

/**
 * Display an error message in the WP admin.
 *
 * @param string $message The message content
 *
 * @return void
 */
function errorNotice(string $message)
{
    add_action('all_admin_notices', static function () use ($message) {
        $class = 'notice notice-error';
        printf('<div class="%1$s"><p>%2$s</p></div>', esc_attr($class), wp_kses_post($message));
    });
}

/**
 * Handle any exception that might occur during plugin setup.
 *
 * @param Throwable $throwable The Exception
 *
 * @return void
 */
function handleException(Throwable $throwable)
{
    error_log($throwable->getMessage() . ' ' . $throwable->getTraceAsString());

    errorNotice(sprintf(
        '<strong>Error:</strong> %s <br><pre>%s</pre>',
        $throwable->getMessage(),
        $throwable->getTraceAsString()
    ));
}

function plugin(): Package
{
    static $package;
    if (!$package) {
        $properties = PluginProperties::new(__FILE__);
        $package = Package::new($properties);
    }

    return $package;
}

/**
 * Initialize all the plugin things.
 *
 * @throws Throwable
 */
function initialize(): void
{
    try {
        if (is_readable(__DIR__ . '/vendor/autoload.php')) {
            include_once __DIR__ . '/vendor/autoload.php';
        }

        plugin()
            ->addModule(new Integrations\Theme\Module())
            ->addModule(new Settings\Module())
            ->boot();
    } catch (Throwable $throwable) {
        handleException($throwable);
    }
}

add_action('plugins_loaded', __NAMESPACE__ . '\\initialize');
