import { createFileRoute } from '@tanstack/react-router';
import { CommunityTools } from '@/components/community-tools-v9';
export const Route=createFileRoute('/c/$slug/tools')({component:Page});
function Page(){const {slug}=Route.useParams();return <CommunityTools slug={slug}/>;}
