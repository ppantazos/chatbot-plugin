<?php

declare(strict_types=1);

namespace Avatar\AvatarIntegration\Integrations\Theme;

use Avatar\AvatarIntegration\Settings\Registrar;
use Inpsyde\Modularity\Properties\Properties;

class AssetsInjector
{
    public function __construct(private Properties $properties)
    {
    }

    public function inject(): void
    {
        wp_enqueue_script(
            'livekit',
            'https://cdn.jsdelivr.net/npm/livekit-client@2.11.3/dist/livekit-client.umd.min.js',
            [],
            '2.11.3',
            false
        );
        // wp_enqueue_script(
        //     'main-chat-integration',
        //     $this->properties->baseUrl() . '/dist/main.js',
        //     ['livekit'],
        //     $script_version,
        //     true
        // );
        
        // add_filter('script_loader_tag', function ($tag, $handle, $src) {
        //     if ($handle === 'main-chat-integration') {
        //         return '<script type="module" src="' . esc_url($src) . '"></script>';
        //     }
        //     return $tag;
        // }, 10, 3);

        // Check both dist (built) and assets/js (source) paths
        $dist_path = $this->properties->basePath() . '/dist/main.js';
        $source_path = $this->properties->basePath() . '/assets/js/main.js';
        
        // Prefer built file, fallback to source if dist doesn't exist
        $script_file_path = file_exists($dist_path) ? $dist_path : $source_path;
        $script_url = file_exists($dist_path) 
            ? $this->properties->baseUrl() . '/dist/main.js'
            : $this->properties->baseUrl() . '/assets/js/main.js';
        
        $script_version = file_exists($script_file_path) ? filemtime($script_file_path) : '1.0.0';
        // Add timestamp for aggressive cache busting on mobile
        $cache_buster = $script_version . '.' . time();

        // Output script module data FIRST (before script loads) to ensure it's available
        // Use priority 1 to ensure it's output early in wp_footer
        add_action('wp_footer', function () {
            $module_data = $this->moduleDataGenerator();
            echo '<script type="application/json" id="wp-script-module-data-main-chat-integration">' . wp_json_encode($module_data) . '</script>' . "\n";
        }, 1);
        
        // Use wp_enqueue_script with module type filter for better compatibility
        wp_enqueue_script(
            'main-chat-integration',
            $script_url,
            ['livekit'],
            $cache_buster, // Use cache buster instead of just version
            true
        );
        
        // Add type="module" attribute with error handling and mobile compatibility
        add_filter('script_loader_tag', function ($tag, $handle, $src) use ($cache_buster) {
            if ($handle === 'main-chat-integration') {
                // Add cache-busting query parameter for mobile browsers
                $separator = strpos($src, '?') !== false ? '&' : '?';
                $src_with_cache = $src . $separator . 'v=' . $cache_buster;
                // Add crossorigin for better CORS handling on mobile
                // Use self-closing script tag format
                return '<script type="module" src="' . esc_url($src_with_cache) . '" id="' . esc_attr($handle) . '-js" crossorigin="anonymous"></script>' . "\n";
            }
            return $tag;
        }, 10, 3);
        
        // Add error handling script in footer for debugging module loading failures
        add_action('wp_footer', function () {
            echo '<script>' . "\n";
            echo 'window.addEventListener("error", function(e) {' . "\n";
            echo '  if (e.target && e.target.tagName === "SCRIPT" && e.target.src && e.target.src.includes("main.js")) {' . "\n";
            echo '    console.error("Chatbot module failed to load:", e.target.src, e.message || e.error);' . "\n";
            echo '  }' . "\n";
            echo '}, true);' . "\n";
            echo '</script>' . "\n";
        }, 2);
        // wp_enqueue_script(
        //     'main-chat-integration',
        //     $this->properties->baseUrl() . '/dist/main.js',
        //     ['livekit'],
        //     $script_version,
        //     true
        // );

        // Get file modification time for cache busting
        $css_file_path = $this->properties->basePath() . '/assets/css/style.css';
        $file_version = file_exists($css_file_path) ? filemtime($css_file_path) : '1.0.0';
        // Add timestamp for aggressive cache busting on mobile
        $css_cache_buster = $file_version . '.' . time();
        
        wp_enqueue_style(
            'main-chat-integration-style',
            $this->properties->baseUrl() . '/assets/css/style.css',
            [],
            $css_cache_buster
        );
    }

    public function moduleDataGenerator(): array
    {
        return [
            'apiKey' => get_option(Registrar::SETTING_API_KEY),
            'avatarServiceUrl' => get_option(Registrar::SETTING_AVATAR_SERVICE_URL) ?: '',
        ];
    }
}
