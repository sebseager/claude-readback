import { Lock, Monitor, Moon, Sun, Trash2 } from 'lucide-react'
import { saveShowHiddenContext } from '@/app/prefs'
import { useSessionStore } from '@/app/sessionStore'
import { useUiStore } from '@/app/store'
import { useChatStore } from '@/components/chat/chatStore'
import { useTheme, type ThemePreference } from '@/app/theme'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function SettingsSheet() {
  const open = useUiStore((s) => s.settingsOpen)
  const setOpen = useUiStore((s) => s.setSettingsOpen)
  const chatFont = useUiStore((s) => s.chatFont)
  const setChatFont = useUiStore((s) => s.setChatFont)
  const { preference, setPreference } = useTheme()
  const showHidden = useChatStore((s) => s.showHiddenContextDefault)
  const setShowHidden = useChatStore((s) => s.setShowHiddenContextDefault)
  const clearAll = useSessionStore((s) => s.clearAll)
  const sessionCount = useSessionStore((s) => s.sessions.length)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-[340px] gap-0 bg-sidebar sm:max-w-[340px]">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="font-serif text-xl font-medium tracking-tight">Settings</SheetTitle>
          <SheetDescription className="sr-only">Appearance and data settings</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-5 py-5">
          <section className="flex flex-col gap-2.5">
            <h3 className="text-sm font-medium text-fg">Theme</h3>
            <Tabs value={preference} onValueChange={(v) => setPreference(v as ThemePreference)}>
              <TabsList className="w-full">
                <TabsTrigger value="system">
                  <Monitor />
                  System
                </TabsTrigger>
                <TabsTrigger value="light">
                  <Sun />
                  Light
                </TabsTrigger>
                <TabsTrigger value="dark">
                  <Moon />
                  Dark
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </section>

          <section className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-fg" id="chat-font-label">
                Chat font
              </h3>
              <p className="text-xs text-fg-muted">Serif reads like claude.ai&apos;s classic style.</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={chatFont === 'sans' ? 'text-fg' : 'text-fg-muted'}>Sans</span>
              <Switch
                aria-labelledby="chat-font-label"
                checked={chatFont === 'serif'}
                onCheckedChange={(checked) => setChatFont(checked ? 'serif' : 'sans')}
              />
              <span className={chatFont === 'serif' ? 'font-serif text-fg' : 'font-serif text-fg-muted'}>
                Serif
              </span>
            </div>
          </section>

          <section className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-fg" id="hidden-context-label">
                Show hidden context by default
              </h3>
              <p className="text-xs text-fg-muted">
                Expand system reminders, attachments and meta records under every turn.
              </p>
            </div>
            <Switch
              aria-labelledby="hidden-context-label"
              checked={showHidden}
              onCheckedChange={(checked) => {
                setShowHidden(checked)
                saveShowHiddenContext(checked)
              }}
            />
          </section>

          <Separator />

          <section className="flex flex-col gap-2.5">
            <h3 className="text-sm font-medium text-fg">Data</h3>
            <p className="text-xs text-fg-muted">
              {sessionCount} session{sessionCount === 1 ? '' : 's'} stored in this browser&apos;s IndexedDB.
              Clearing removes them from this device only.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-fit gap-2" disabled={sessionCount === 0}>
                  <Trash2 />
                  Clear all data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Every stored session and subagent transcript will be removed from this browser. This
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-danger text-white hover:bg-danger/90"
                    onClick={() => void clearAll()}
                  >
                    Clear all data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </section>
        </div>

        <p className="mt-auto flex items-center gap-1.5 border-t px-5 py-4 text-xs text-fg-muted">
          <Lock className="size-3" />
          Runs entirely in your browser. Nothing is uploaded.
        </p>
      </SheetContent>
    </Sheet>
  )
}
