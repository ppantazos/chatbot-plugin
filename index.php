<?php
declare(strict_types=1);

/**
 * Plugin Name: SellEmbedded Chatbot
 */

if (!defined('ABSPATH')) {
    exit;
}

$localConfig = __DIR__ . '/config.local.php';
if (file_exists($localConfig)) {
    require_once $localConfig;
}

require_once __DIR__ . '/vendor/autoload.php';

add_action('plugins_loaded', function () {
    try {
        $properties = \Inpsyde\Modularity\Properties\PluginProperties::new(__FILE__);
        $package = \Inpsyde\Modularity\Package::new($properties);

        $package
            ->addModule(new \Avatar\AvatarIntegration\Integrations\Theme\Module())
            ->addModule(new \Avatar\AvatarIntegration\Settings\Module())
            ->boot();

    } catch (\Throwable $throwable) {
        error_log($throwable->getMessage());
    }
});
