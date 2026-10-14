import {createFileRoute} from '@tanstack/react-router';
import {mobileOAuthCallback} from '@/lib/auth/mobile-oauth.server';
export const Route=createFileRoute('/api/v1/auth/mobile-callback')({server:{handlers:{GET:({request})=>mobileOAuthCallback(request)}}});
