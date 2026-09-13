import { Body, Controller, Get, Module, Param, Put, UseGuards } from '@nestjs/common';
import { PrismaService } from '../infra.module';
import { AuthGuard, AuthUser, CurrentUser } from '../common/auth-guard';

interface WidgetOrderItem {
  key: string;
  hidden?: boolean;
  span?: number;
  height?: string;
}

const ALLOWED_SPANS = [3, 4, 6, 8, 12];
const ALLOWED_HEIGHTS = ['auto', 'sm', 'md', 'lg'];

@UseGuards(AuthGuard)
@Controller('me/layout')
export class PageLayoutController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':pageKey')
  async get(@Param('pageKey') pageKey: string, @CurrentUser() me: AuthUser) {
    const row = await this.prisma.userPageLayout.findUnique({
      where: { userId_pageKey: { userId: me.sub, pageKey } },
    });
    return { pageKey, layout: (row?.layout as WidgetOrderItem[] | null) ?? null };
  }

  @Put(':pageKey')
  async put(
    @Param('pageKey') pageKey: string,
    @Body() body: { layout?: WidgetOrderItem[] },
    @CurrentUser() me: AuthUser,
  ) {
    const layout = Array.isArray(body?.layout) ? body.layout.slice(0, 50) : [];
    const clean: WidgetOrderItem[] = layout
      .filter((x) => x && typeof x.key === 'string' && x.key.length <= 64)
      .map((x) => ({
        key: x.key,
        hidden: !!x.hidden,
        ...(x.span && ALLOWED_SPANS.includes(Number(x.span)) ? { span: Number(x.span) } : {}),
        ...(x.height && ALLOWED_HEIGHTS.includes(String(x.height)) ? { height: String(x.height) } : {}),
      }));
    await this.prisma.userPageLayout.upsert({
      where: { userId_pageKey: { userId: me.sub, pageKey } },
      update: { layout: clean as unknown as object },
      create: { userId: me.sub, pageKey, layout: clean as unknown as object },
    });
    return { pageKey, layout: clean };
  }
}

@Module({ controllers: [PageLayoutController] })
export class PageLayoutModule {}
