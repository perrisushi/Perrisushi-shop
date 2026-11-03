import {fail} from './moderation.mjs';
// Call only inside the shared economy transaction, with the event row already locked.
export async function verifiedRaffleEntries(c,raffleId){
 const rls=(await c.query("SELECT bool_or(row_security_active(t::regclass)) AS filtered FROM unnest(ARRAY['public.pw2_raffle_entries','public.pw2_raffle_ticket_reservations','public.shop_operations']) t")).rows[0];
 if(rls?.filtered)fail(503,'community_unavailable');
 const entries=(await c.query(`SELECT e.nick,e.tickets,coalesce(sum(b.quantity),0)::int AS reserved,
  coalesce(bool_and(coalesce(b.ticket_field=r.ticket_field AND o.nick=e.nick AND o.action='raffle-register'
   AND b.operation_id='pw2:raffle-register:'||lower(o.response->'result'->>'operationId')
   AND lower(o.response->'result'->>'raffleId')=r.id::text
   AND o.response->'result'->'reservation'=jsonb_build_object('quantity',b.quantity,'ticketField',b.ticket_field,
      'availableBefore',b.available_before,'availableAfter',b.available_after),false)),false) AS backed
 FROM public.pw2_raffle_entries e JOIN public.pw2_raffles r ON r.id=e.raffle_id
 LEFT JOIN public.pw2_raffle_ticket_reservations b USING(raffle_id,nick)
 LEFT JOIN public.shop_operations o ON o.operation_id=b.operation_id
 WHERE e.raffle_id=$1 GROUP BY e.nick,e.tickets ORDER BY e.nick`,[raffleId])).rows;
 if(entries.some(e=>!e.backed||!Number.isInteger(e.tickets)||e.tickets<1||e.tickets>4||e.tickets!==e.reserved))fail(409,'raffle_integrity_error');
 return entries.map(({nick,tickets})=>({nick,tickets}));
}
