<?php

declare(strict_types=1);

namespace Avatar\AvatarIntegration\Settings;

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
            PageRenderer::class => static fn (ContainerInterface $container) => new PageRenderer(
                $container->get(Package::PROPERTIES),
            ),
            FieldRenderer::class => static fn (ContainerInterface $container) => new FieldRenderer(
                $container->get(Package::PROPERTIES)
            ),
            MenuInjector::class => static fn (ContainerInterface $container) => new MenuInjector(
                $container->get(PageRenderer::class)
            ),
            Registrar::class => static fn (ContainerInterface $container) => new Registrar(
                $container->get(FieldRenderer::class),
            )
        ];
    }

    public function run(ContainerInterface $container): bool
    {
        add_action('admin_init', [$container->get(Registrar::class), 'register']);
        add_action('admin_menu', [$container->get(MenuInjector::class), 'inject']);

        return true;
    }
}
