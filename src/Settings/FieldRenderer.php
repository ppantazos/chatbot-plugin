<?php

declare(strict_types=1);

namespace Avatar\AvatarIntegration\Settings;

use Inpsyde\Modularity\Properties\Properties;
use RuntimeException;

class FieldRenderer
{
    public function __construct(private Properties $properties)
    {
    }

    public function render(array $args = []): void
    {
        $templatePath = sprintf(
            "%s/%s/%s.php",
            $this->properties->basePath(),
            'templates/settings',
            'input'
        );

        if (!file_exists($templatePath)) {
            throw new RuntimeException('Missing template file for settings input.');
        }

        require $templatePath;
    }
}
