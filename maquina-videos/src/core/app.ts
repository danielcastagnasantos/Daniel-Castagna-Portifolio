/** Raiz de composição: cria e liga todas as peças. Usado pelo servidor, pela CLI e pelos testes. */
import { AssetPaths } from "./assets";
import { BrandRegistry } from "./brands";
import type { AppConfig } from "./config";
import { EventBus } from "./events";
import { Ffmpeg } from "./media/ffmpeg";
import { Engine } from "./pipeline/engine";
import type { PipelineDeps } from "./pipeline/context";
import { createProviders } from "./providers";
import { RemotionRenderer } from "./render/remotionRenderer";
import type { Renderer } from "./render/types";
import { ProjectStore } from "./store/projectStore";

export interface App {
  config: AppConfig;
  bus: EventBus;
  store: ProjectStore;
  brands: BrandRegistry;
  assets: AssetPaths;
  ffmpeg: Ffmpeg;
  engine: Engine;
  deps: PipelineDeps;
}

export async function createApp(config: AppConfig, overrides: { renderer?: Renderer; providersFor?: PipelineDeps["providersFor"] } = {}): Promise<App> {
  const bus = new EventBus();
  const store = new ProjectStore(config.dataDir);
  await store.init();
  store.on("changed", (p) => bus.emit("project", p));
  const brands = new BrandRegistry(config.configDir);
  const assets = new AssetPaths(config.dataDir, config.assetsDir);
  const ffmpeg = new Ffmpeg(config.ffmpegPath, config.ffprobePath);
  const renderer = overrides.renderer ?? new RemotionRenderer(config, assets);
  const deps: PipelineDeps = {
    config,
    store,
    brands,
    assets,
    ffmpeg,
    bus,
    renderer,
    providersFor: overrides.providersFor ?? ((p) => createProviders(config, { testMode: p.testMode, visualMode: p.visualMode }, ffmpeg)),
  };
  return { config, bus, store, brands, assets, ffmpeg, engine: new Engine(deps), deps };
}
