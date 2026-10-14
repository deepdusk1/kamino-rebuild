import { createFileRoute } from '@tanstack/react-router';
import { CommunityEvents } from '@/components/events-v9';
export const Route=createFileRoute('/c/$slug/events')({component:Events});
function Events(){const {slug}=Route.useParams();return <CommunityEvents slug={slug}/>;}
