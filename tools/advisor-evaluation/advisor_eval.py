"""M6 evaluation only: deterministic report/review prompts, no API client or posting."""
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal, InvalidOperation
from html import escape
from pathlib import Path
from uuid import UUID
from zoneinfo import ZoneInfo
import json
import sys

BAGHDAD = ZoneInfo('Asia/Baghdad')
CHECKS = ('line_totals_match', 'cash_reconciles', 'balances_valid', 'all_orders_reportable')
MONEY = ('invoiced_sales', 'net_collections', 'current_outstanding', 'current_overpayments', 'current_overdue', 'unknown_aging', 'unallocated_cash')
COUNT = ('invoice_count', 'reminders_due', 'unallocated_entries')
LABELS = {
    'invoice_count': 'Invoices issued in selected period',
    'invoiced_sales': 'Invoiced sales in selected period',
    'net_collections': 'Signed customer collections in selected period',
    'current_outstanding': 'Current receivables · all invoices',
    'current_overpayments': 'Current overpayments · separate from receivables',
    'current_overdue': 'Current overdue receivables',
    'unknown_aging': 'Current balances without a due date',
    'reminders_due': 'Collection reminders due now',
}


def stamp(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('Timestamp needs an explicit timezone.')
    return result


def money(value):
    try:
        result = Decimal(str(value))
        if not result.is_finite() or result.quantize(Decimal('0.01')) != result:
            raise ValueError('Money must be finite exact USD cents.')
        return result
    except (InvalidOperation, TypeError):
        raise ValueError('Money must be finite exact USD cents.') from None


def usd(value):
    return ('-$' if value < 0 else '$') + f'{abs(value):,.2f}'


def evaluate(snapshot, now=None):
    now = now or datetime.now(timezone.utc)
    at = stamp(snapshot['as_of'])
    start, end = stamp(snapshot['period_start']), stamp(snapshot['period_end'])
    if snapshot['timezone'] != 'Asia/Baghdad' or not start <= at < end:
        raise ValueError('Invalid reporting period or timezone.')
    if end.astimezone(BAGHDAD).date() - start.astimezone(BAGHDAD).date() != timedelta(days=7):
        raise ValueError('Use the declared seven-calendar-day period.')
    metrics = snapshot['metrics']
    amounts = {key: money(metrics[key]) for key in MONEY}
    for key in COUNT:
        if type(metrics[key]) is not int or metrics[key] < 0:
            raise ValueError('Counts must be nonnegative integers.')
    for key in ('current_outstanding', 'current_overpayments', 'current_overdue', 'unknown_aging', 'invoiced_sales'):
        if amounts[key] < 0:
            raise ValueError('Unexpected negative source balance.')
    if amounts['current_overdue'] + amounts['unknown_aging'] > amounts['current_outstanding']:
        raise ValueError('Aging does not reconcile to current receivables.')
    blockers = [key for key in CHECKS if snapshot.get('checks', {}).get(key) is not True]
    if now - at > timedelta(hours=24) or at - now > timedelta(minutes=5):
        blockers.append('Snapshot is stale or the source clock needs review.')
    if metrics['unallocated_entries'] or amounts['unallocated_cash'] != 0:
        blockers.append('Unallocated cash needs reconciliation before prioritization.')
    candidates, seen = [], set()
    for index, row in enumerate(snapshot['candidates']):
        route = row['route']
        prefix = '/admin/orders?invoice='
        if not route.startswith(prefix):
            raise ValueError('Candidate link must stay in the owner Admin invoice view.')
        UUID(route[len(prefix):])
        if route in seen:
            raise ValueError('Duplicate invoice candidate.')
        seen.add(route)
        amount = money(row['amount'])
        if amount <= 0:
            raise ValueError('Collection candidates need positive outstanding.')
        due = date.fromisoformat(row['due_date']) if row.get('due_date') else None
        schedule = stamp(row['scheduled_at']) if row.get('scheduled_at') else None
        overdue = due is not None and due < at.astimezone(BAGHDAD).date()
        reason = 'overdue' if overdue else 'reminder_due' if schedule and schedule <= at else 'upcoming'
        if reason != row['reason'] or (reason == 'upcoming' and (not schedule or schedule > at + timedelta(days=7))):
            raise ValueError('Candidate reason is not supported by dates.')
        candidates.append({**row, 'amount_value': amount, 'source_index': index,
                           'priority': {'overdue': 0, 'reminder_due': 1, 'upcoming': 2}[reason]})
    if sum((row['amount_value'] for row in candidates if row['reason'] == 'overdue'), Decimal(0)) != amounts['current_overdue']:
        blockers.append('Overdue candidate detail does not reconcile to the total.')
    due_count = sum(bool(row.get('scheduled_at') and stamp(row['scheduled_at']) <= at) for row in candidates)
    if due_count != metrics['reminders_due']:
        blockers.append('Reminder detail does not reconcile to the due count.')
    candidates.sort(key=lambda row: (row['priority'], -row['amount_value'], row['invoice_label']))
    prompts = []
    if not blockers:
        for row in candidates[:3]:
            if row['reason'] == 'overdue':
                text = f"Review {row['client_alias']} / {row['invoice_label']}: {usd(row['amount_value'])} is overdue since {row['due_date']}."
            elif row['reason'] == 'reminder_due':
                text = f"Review the due collection reminder for {row['client_alias']} / {row['invoice_label']}: {usd(row['amount_value'])} remains outstanding."
            else:
                scheduled = stamp(row['scheduled_at']).astimezone(BAGHDAD).strftime('%d %b %Y %H:%M')
                text = f"Prepare the scheduled follow-up for {row['client_alias']} / {row['invoice_label']} on {scheduled} Baghdad time; outstanding {usd(row['amount_value'])}. This is not a claim that payment is overdue."
            prompts.append({'text': text, 'route': row['route'], 'source': f"M6.Q1.candidates[{row['source_index']}]"})
    caveats = [
        'Snapshot only. Refresh the source report before acting; pending phone work is excluded until uploaded.',
        'Sales use invoice issue dates; collections use cash-event dates. They are different cohorts, so no collection-efficiency ratio is inferred.',
        'Current receivables are as of this snapshot, not a historical balance for the selected period.',
        'No prior comparable period or targets were supplied: no growth, forecast, credit-risk or causal conclusions.',
        'Recommendations are review prompts only. The owner decides whether and how to act; nothing is posted or sent.',
        'M5 #13 and broader finance #12 remain open; this evaluation does not certify those gates.',
    ]
    if snapshot.get('today_partial'):
        caveats.append('The rolling seven-calendar-day period includes today, which is incomplete.')
    caveats.append('Pilot coverage is not established for general performance conclusions. No statistical sufficiency threshold is inferred.')
    if metrics['invoice_count'] == 0:
        caveats.append('No invoices were issued in this period; that does not prove business health or collection success.')
    if amounts['unknown_aging'] > 0:
        caveats.append('Some balances have no due date. They are not assumed current or overdue.')
    return {'eligible': not blockers, 'blockers': blockers, 'prompts': prompts, 'caveats': caveats,
            'facts': {key: usd(amounts[key]) if key in MONEY else str(metrics[key]) for key in LABELS}}


def render(snapshot, result, output):
    at = stamp(snapshot['as_of']).astimezone(BAGHDAD).strftime('%d %b %Y, %H:%M')
    start = stamp(snapshot['period_start']).astimezone(BAGHDAD).strftime('%d %b %Y %H:%M')
    end = stamp(snapshot['period_end']).astimezone(BAGHDAD).strftime('%d %b %Y %H:%M')
    facts = ''.join(f'<tr><td>{escape(LABELS[key])}</td><td>{escape(value)}</td><td><code>M6.Q1.metrics.{key}</code></td></tr>' for key, value in result['facts'].items()) if result['eligible'] else '<tr><td>Figures withheld pending source reconciliation/freshness review.</td></tr>'
    prompts = ''.join(f'<li>{escape(row["text"])} <a href="https://shakarchi-admin.vercel.app{escape(row["route"], quote=True)}">Review invoice</a> <small>{escape(row["source"])}</small></li>' for row in result['prompts'])
    prompts = prompts or '<li>No supported collection-priority suggestions available.</li>'
    caveats = ''.join('<li>'+escape(value)+'</li>' for value in result['blockers'] + result['caveats'])
    output.write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M6 · Owner review</title>
<style>body{{font:16px/1.6 system-ui;background:#f5f7f8;color:#182638;max-width:1100px;margin:30px auto;padding:24px}}section{{background:white;border-radius:18px;padding:26px;margin:20px 0}}h1,h2{{line-height:1.2}}table{{width:100%;border-collapse:collapse}}td{{padding:12px;border-bottom:1px solid #e8edf1}}td:nth-child(2){{font-weight:700;white-space:nowrap}}small,code{{font-size:12px;color:#526477}}a{{color:#225d42}}li{{margin:15px 0}}.tag{{background:#d4ef70;padding:5px 12px;border-radius:20px}}@media(max-width:700px){{table{{font-size:13px}}td:last-child{{display:none}}}}</style>
<header><span class="tag">Private · M6 evaluation draft</span><h1>Which collection follow-ups deserve attention?</h1><p>As of {at} · Baghdad. Period: {start} to {end} exclusive.</p><p>Compare the factual baseline with the proposed review prompts. No AI service or automation is installed.</p></header>
<section><h2>A · Factual baseline</h2><table>{facts}</table></section>
<section><h2>B · Proposed advisor review prompts</h2><ol>{prompts}</ol><p><small>Rule: overdue first, then due reminders, then upcoming scheduled reminders; within each group, largest current balance first. At most three distinct invoices.</small></p></section>
<section><h2>Limits and evidence</h2><ul>{caveats}</ul><p>Source: {escape(snapshot['source'])}. Migration {escape(str(snapshot['migration_head']))}. Source query: source-query.sql. No new financial writes.</p></section>
<section><h2>Owner decision</h2><p>Does B add useful next steps beyond A? Reply: <strong>Continue</strong>, <strong>Keep factual report</strong>, or <strong>Amend</strong>. Final M6 acceptance remains open until your usefulness decision.</p></section></html>''')


if __name__ == '__main__':
    snapshot = json.loads(Path(sys.argv[1]).read_text())
    result = evaluate(snapshot)
    render(snapshot, result, Path(sys.argv[2]))
    print(json.dumps({'source_checks_accepted': result['eligible'], 'review_prompts': len(result['prompts']), 'output': sys.argv[2]}))
