import type {Metadata} from 'next';
import PasswordRecovery from '@/components/auth/PasswordRecovery';
export const metadata:Metadata={title:'Reset your password',robots:{index:false,follow:false}};
export default function ForgotPasswordPage(){return <PasswordRecovery/>;}
