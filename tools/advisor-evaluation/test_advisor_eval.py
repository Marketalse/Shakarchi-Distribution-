import unittest
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from advisor_eval import evaluate, render
from pathlib import Path
from tempfile import TemporaryDirectory

AT=datetime(2026,11,22,12,tzinfo=timezone.utc)
def fixture():
 return {'source':'Synthetic M6.Q1','migration_head':'016','as_of':AT.isoformat(),'timezone':'Asia/Baghdad','period_start':'2026-11-15T21:00:00Z','period_end':'2026-11-22T21:00:00Z','today_partial':True,
 'metrics':{'invoice_count':2,'invoiced_sales':'100.00','net_collections':'60.00','current_outstanding':'40.00','current_overpayments':'0.00','current_overdue':'10.00','unknown_aging':'0.00','unallocated_cash':'0.00','unallocated_entries':0,'reminders_due':0},
 'checks':{'line_totals_match':True,'cash_reconciles':True,'balances_valid':True,'all_orders_reportable':True},
 'candidates':[{'client_alias':'Client A','invoice_label':'INV-TEST1','route':'/admin/orders?invoice=00000000-0000-0000-0000-000000000001','amount':'10.00','due_date':'2026-11-21','scheduled_at':None,'reason':'overdue'},
 {'client_alias':'Client B','invoice_label':'INV-TEST2','route':'/admin/orders?invoice=00000000-0000-0000-0000-000000000002','amount':'30.00','due_date':'2026-11-26','scheduled_at':'2026-11-26T09:00:00Z','reason':'upcoming'}]}

class AdvisorCases(unittest.TestCase):
 def test_normal_traceable_ranking(self):
  r=evaluate(fixture(),AT)
  self.assertTrue(r['eligible']);self.assertEqual(len(r['prompts']),2)
  self.assertIn('overdue since 2026-11-21',r['prompts'][0]['text'])
  self.assertIn('not a claim that payment is overdue',r['prompts'][1]['text'])
  self.assertEqual(r['prompts'][0]['source'],'M6.Q1.candidates[0]')
  self.assertIn('partial', ' '.join(r['caveats']).replace('incomplete','partial'))
 def test_reconciliation_failure_and_missing_checks_withhold(self):
  for key in fixture()['checks']:
   s=fixture();s['checks'][key]=False
   r=evaluate(s,AT);self.assertFalse(r['eligible']);self.assertEqual(r['prompts'],[])
  s=fixture();del s['checks']['cash_reconciles'];self.assertFalse(evaluate(s,AT)['eligible'])
 def test_unallocated_offsetting_events_still_block(self):
  s=fixture();s['metrics']['unallocated_entries']=2
  self.assertFalse(evaluate(s,AT)['eligible'])
 def test_stale_and_future_source_clocks_block(self):
  self.assertFalse(evaluate(fixture(),AT+timedelta(days=2))['eligible'])
  self.assertFalse(evaluate(fixture(),AT-timedelta(minutes=6))['eligible'])
 def test_zero_data_is_not_success_or_a_forecast(self):
  s=fixture();s['candidates']=[]
  for key in s['metrics']:s['metrics'][key]=0 if type(s['metrics'][key]) is int else '0.00'
  r=evaluate(s,AT);self.assertTrue(r['eligible']);self.assertEqual(r['prompts'],[])
  self.assertIn('Pilot coverage is not established',' '.join(r['caveats']))
  self.assertIn('no growth, forecast',' '.join(r['caveats']))
 def test_unknown_due_dates_are_not_assumed_overdue_and_negative_cash_is_allowed(self):
  s=fixture();s['metrics'].update(current_overdue='0.00',unknown_aging='10.00',net_collections='-5.00')
  s['candidates']=[s['candidates'][1]]
  r=evaluate(s,AT);self.assertTrue(r['eligible']);self.assertEqual(r['facts']['net_collections'],'-$5.00')
  self.assertIn('not assumed current or overdue',' '.join(r['caveats']))
 def test_duplicate_rows_bad_routes_and_unsupported_reasons_are_rejected(self):
  s=fixture();s['candidates'].append(deepcopy(s['candidates'][0]))
  with self.assertRaisesRegex(ValueError,'Duplicate'):evaluate(s,AT)
  s=fixture();s['candidates'][0]['route']='https://example.com/private'
  with self.assertRaisesRegex(ValueError,'owner Admin'):evaluate(s,AT)
  s=fixture();s['candidates'][1]['reason']='overdue'
  with self.assertRaisesRegex(ValueError,'dates'):evaluate(s,AT)
 def test_candidate_sum_and_reminder_count_are_independently_checked(self):
  s=fixture();s['candidates'][0]['amount']='9.99';self.assertFalse(evaluate(s,AT)['eligible'])
  s=fixture();s['metrics']['reminders_due']=1;self.assertFalse(evaluate(s,AT)['eligible'])
 def test_max_three_and_same_day_due_is_not_overdue(self):
  s=fixture();s['candidates']=[]
  for i,amount in enumerate(['10.00','20.00','30.00','40.00']):
   row=fixture()['candidates'][0];row.update(invoice_label=f'INV-TEST{i}',route='/admin/orders?invoice=00000000-0000-0000-0000-'+str(i+1).zfill(12),amount=amount);s['candidates'].append(row)
  s['metrics'].update(current_overdue='100.00',current_outstanding='100.00')
  r=evaluate(s,AT);self.assertEqual(len(r['prompts']),3);self.assertIn('$40.00',r['prompts'][0]['text'])
  s=fixture();s['metrics']['current_overdue']='0.00';s['candidates']=[s['candidates'][1]];s['candidates'][0]['due_date']='2026-11-22'
  self.assertTrue(evaluate(s,AT)['eligible']);self.assertNotIn('is overdue since',evaluate(s,AT)['prompts'][0]['text'])
 def test_exact_money_invalid_values_and_html_escaping(self):
  s=fixture();s['metrics']['invoiced_sales']='NaN'
  with self.assertRaises(ValueError):evaluate(s,AT)
  s=fixture();s['metrics']['current_overdue']='0.001'
  with self.assertRaises(ValueError):evaluate(s,AT)
  s=fixture();s['candidates'][0]['client_alias']='<script>evil()</script>'
  with TemporaryDirectory() as temp:
   p=Path(temp)/'report.html';render(s,evaluate(s,AT),p);html=p.read_text()
   self.assertNotIn('<script>',html);self.assertIn('&lt;script&gt;',html)

if __name__=='__main__':unittest.main()
