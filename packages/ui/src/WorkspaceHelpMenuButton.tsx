import {
  DesktopCommandIds,
  TID_WORKSPACE_HELP_MENU_RESOURCE_MANAGER,
  TID_WORKSPACE_HELP_MENU_TRIGGER,
} from "@zcode/shared";
import { ActivityIcon, CircleHelpIcon, DownloadIcon, InfoIcon, RefreshCwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { cn } from "@/components/lib/utils.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useFeedbackStore } from "@/feedback/feedbackStore.js";
import { useDesktopUpdateMenu } from "@/hooks/useDesktopUpdateMenu.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { createHelpMenuActionHandlers } from "@/lib/helpMenuActions.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function WorkspaceHelpMenuButton({
  className,
  isDesktop = false,
}: {
  className?: string;
  /**
   * 是否桌面端。由挂载处注入而不是在组件内嗅探：Web 的 IPlatformService 桩同样实现了
   * executeDesktopCommand（no-op），拿它判定会让 Web 端出现一个点了没反应的「资源管理器」。
   */
  isDesktop?: boolean;
}) {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const updateMenu = useDesktopUpdateMenu(isDesktop);
  const openFeedbackSubmit = useFeedbackStore((state) => state.openSubmit);
  const helpMenuActions = createHelpMenuActionHandlers({
    platform,
    intl,
    openSubmit: openFeedbackSubmit,
  });
  const helpMenuLabel = intl.formatMessage({ id: "workspaceHeader.help.menu" });
  const handleOpenResourceManager = () => {
    void platform.executeDesktopCommand(DesktopCommandIds.OpenResourceManager);
  };

  const handleShowAbout = () => {
    void platform.executeDesktopCommand(DesktopCommandIds.ShowAbout);
  };

  // 本地定制：产品文档 / 用户社群 / 问题上报 / 给产品提需求 四项已从菜单移除
  // （它们都指向上游的产品服务入口）；上游新增的「报告安全问题」同样不显示。
  // 剩下的都是桌面专属——Web 没有资源管理器、桌面更新与关于面板——所以 Web 上不渲染这个按钮，
  // 否则会留下一个点开是空的菜单。
  // 注意 `lib/helpMenuActions.ts` **仍在用**（上游新增的「导出日志」项走它），不是死代码。
  if (!isDesktop) {
    return null;
  }

  return (
    <DropdownMenu>
      <ControlHintTooltip title={helpMenuLabel} side="bottom">
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-md"
            // Settings 页会把帮助按钮绝对定位在 Electron 顶部拖拽区上方。
            // 只依赖外层容器 no-drag 时，真实 trigger 仍可能被标题栏 drag 区吞掉点击。
            className={cn(
              "text-foreground hover:bg-hover hover:text-foreground [app-region:no-drag]",
              className,
            )}
            aria-label={helpMenuLabel}
            data-testid={TID_WORKSPACE_HELP_MENU_TRIGGER}
          >
            <CircleHelpIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
      </ControlHintTooltip>
      <DropdownMenuContent
        align="end"
        className="min-w-0 w-max [&_[data-slot=dropdown-menu-item]]:pr-6"
      >
        <DropdownMenuItem onSelect={helpMenuActions.exportLogs}>
          <DownloadIcon className="size-4" />
          {intl.formatMessage({ id: "titleBar.menu.help.exportLogs" })}
        </DropdownMenuItem>
        {/* Windows/Linux 没有原生菜单栏，自绘标题栏箭头菜单也已下线，
            资源管理器只能从这里进。 */}
        <DropdownMenuItem
          data-testid={TID_WORKSPACE_HELP_MENU_RESOURCE_MANAGER}
          onSelect={handleOpenResourceManager}
        >
          <ActivityIcon className="size-4" />
          {intl.formatMessage({ id: "titleBar.menu.help.resourceManager" })}
        </DropdownMenuItem>
        {updateMenu.visible ? (
          <DropdownMenuItem disabled={updateMenu.disabled} onSelect={updateMenu.checkForUpdates}>
            <RefreshCwIcon className="size-4" />
            {updateMenu.labelId === "desktopMenu.help.restartToUpdate" ? (
              <>
                <span className="whitespace-nowrap">
                  {intl.formatMessage({ id: "desktopMenu.help.restartUpdateAction" })}
                </span>
                <Badge variant="secondary" className="h-4 px-1.5 py-0 bg-success/10 text-success">
                  {updateMenu.labelValues?.version}
                </Badge>
              </>
            ) : (
              intl.formatMessage({ id: updateMenu.labelId }, updateMenu.labelValues)
            )}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={handleShowAbout}>
          <InfoIcon className="size-4" />
          {intl.formatMessage({ id: "titleBar.menu.help.about" })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
