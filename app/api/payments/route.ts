import {paymentActor,paymentFailure} from '@/lib/payment-http';
import {paymentState} from '@/lib/payments';
import {ticketBalance} from '@/lib/tickets';
export const runtime='nodejs';
export async function GET(request:Request){try{const user=await paymentActor(request);return Response.json({...await paymentState(user),wallet:await ticketBalance(user)},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return paymentFailure(error);}}
