<?php

declare(strict_types=1);

namespace Avatar\AvatarIntegration\Integrations\Theme;

use Inpsyde\Modularity\Module\ExecutableModule;
use Inpsyde\Modularity\Module\ModuleClassNameIdTrait;
use Inpsyde\Modularity\Module\ServiceModule;
use Inpsyde\Modularity\Package;
use Psr\Container\ContainerInterface;

class Module implements ServiceModule, ExecutableModule
{

    use ModuleClassNameIdTrait;

    public function services(): array
    {
        return [
            HtmlInjector::class => static fn (ContainerInterface $container) => new HtmlInjector(
                $container->get(Package::PROPERTIES),
            ),
            AssetsInjector::class => static fn (ContainerInterface $container) => new AssetsInjector(
                $container->get(Package::PROPERTIES),
            ),
        ];
    }

    public function run(ContainerInterface $container): bool
    {
        add_action(
            'wp_body_open',
            [$container->get(HtmlInjector::class), 'inject']
        );

        add_action(
            'wp_enqueue_scripts',
            [$container->get(AssetsInjector::class), 'inject']
        );

        return true;
    }
}
