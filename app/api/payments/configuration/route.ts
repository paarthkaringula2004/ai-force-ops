import {paymentActor,paymentFailure,paymentJson} from '@/lib/payment-http';
import {savePaymentConfig} from '@/lib/payments';
export const runtime='nodejs';
export async function POST(request:Request){try{const user=await paymentActor(request,true,true);return Response.json({integration:await savePaymentConfig(user,await paymentJson(request))},{headers:{'Cache-Control':'no-store'}});}catch(error){return paymentFailure(error);}}
