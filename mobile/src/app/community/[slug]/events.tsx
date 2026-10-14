import { useLocalSearchParams } from 'expo-router';
import { CommunityEventsV9 } from '@/components/CommunityEventsV9';
import { withCommunityTheme } from '@/components/CommunityTheme';
function Events(){const {slug}=useLocalSearchParams<{slug:string}>();return <CommunityEventsV9 slug={slug!}/>;}
export default withCommunityTheme(Events);
