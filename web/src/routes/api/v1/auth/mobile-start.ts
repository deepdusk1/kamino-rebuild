import {createFileRoute} from '@tanstack/react-router';
import {mobileOAuthStart} from '@/lib/auth/mobile-oauth.server';
export const Route=createFileRoute('/api/v1/auth/mobile-start')({server:{handlers:{GET:({request})=>mobileOAuthStart(request)}}});
