import { BaseLaudspeakerService } from '@/common/services/base.laudspeaker.service';
import { Liquid } from 'liquidjs';

export class LiquidInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export abstract class BaseLiquidEngineProvider extends BaseLaudspeakerService {
  protected tagEngine: Liquid;

  constructor() {
    super();
    this.tagEngine = new Liquid();
    this.setupCustomTags();
  }

  // Setup custom tags for the Liquid engine
  private setupCustomTags(): void {
    this.tagEngine.registerTag('api_call', {
      parse(token) {
        this.items = token.args.split(' ');
      },
      async render(ctx) {
        const url = this.tagEngine.parseAndRenderSync(this.items[0], ctx.getAll(), ctx.opts);
        try {
          const res = await fetch(url, { method: 'GET' });

          if (res.status !== 200) throw new LiquidInvalidError('Error while processing api_call tag');

          const data = res.headers.get('Content-Type').includes('application/json')
            ? await res.json()
            : await res.text();

          if (this.items[1] === ':save' && this.items[2]) {
            ctx.push({ [this.items[2]]: data });
          }
        } catch (e) {
          throw new LiquidInvalidError('Error while processing api_call tag');
        }
      },
    });
  }

  // Common method to parse templates with the Liquid engine
  protected async parseLiquid(text: string, context: any): Promise<string> {
    return await this.tagEngine.parseAndRender(text, context || {}, { strictVariables: true });
  }
}
