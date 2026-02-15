<?php

declare(strict_types=1);

namespace Avatar\AvatarIntegration\Settings;

use Inpsyde\Modularity\Properties\Properties;

class PageRenderer
{
    public function __construct(private Properties $properties)
    {
    }

    public function render(): void
    {
        $templatePath = sprintf(
            "%s/%s/%s.php",
            $this->properties->basePath(),
            'templates/settings',
            'index'
        );

        if (!file_exists($templatePath)) {
            throw new RuntimeException('Missing template file for settings main page.');
        }

        require $templatePath;
    }
}
