import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell';
import { Connections } from '@/components/social-events-v10';
export const Route=createFileRoute('/connections')({component:Page});
function Page(){return <AppShell padded back title="Connections"><Connections/></AppShell>;}
