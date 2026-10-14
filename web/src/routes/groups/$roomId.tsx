import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell';
import { GroupManagement } from '@/components/social-events-v10';
export const Route=createFileRoute('/groups/$roomId')({component:Page});
function Page(){const {roomId}=Route.useParams();return <AppShell padded back title="Group settings"><GroupManagement roomId={Number(roomId)}/></AppShell>;}
