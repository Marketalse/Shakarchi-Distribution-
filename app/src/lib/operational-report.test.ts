import {it,expect} from 'vitest'
import {operationalReport,reportingWindow,inReportingWindow} from './operational-report'
const at=new Date('2026-11-22T10:00:00Z'),clients=[{id:'one',retail_name:'One'},{id:'two',retail_name:'Two'}]
it('counts one shared order/survey stop once and uses completion date for distinct stores',()=>{
 const data={clients,visits:[{id:'v1',outlet_id:'one',checked_in_at:'2026-11-21T20:55:00Z',checked_out_at:'2026-11-21T21:10:00Z'},{id:'v2',outlet_id:'one',checked_in_at:'2026-11-21T22:00:00Z',checked_out_at:'2026-11-21T22:10:00Z'},{id:'v3',outlet_id:'two',checked_in_at:'2026-11-21T19:00:00Z',checked_out_at:null}],runs:[{id:'run',outlet_id:'one',created_at:'2026-11-21T21:10:00Z',answers:{zero:0,no:false}}],observations:[{id:'obs',outlet_id:'one',created_at:'2026-11-21T21:11:00Z'}]}
 const report=operationalReport(data,'today',at)
 expect(report.started).toBe(1);expect(report.completed).toBe(2);expect(report.clientsVisited).toBe(1);expect(report.open).toBe(1);expect(report.forms).toBe(1);expect(report.observations).toBe(1);expect(report.activity).toHaveLength(4)
})
it('uses half-open Baghdad days and excludes future dates for all-time and calendar periods',()=>{
 const range=reportingWindow('today',at);expect(range.start).toBe('2026-11-22');expect(range.end).toBe('2026-11-23')
 expect(inReportingWindow('2026-11-21T20:59:59.999Z',range)).toBe(false);expect(inReportingWindow('2026-11-21T21:00:00Z',range)).toBe(true);expect(inReportingWindow('2026-11-22T20:59:59.999Z',range)).toBe(true);expect(inReportingWindow('2026-11-22T21:00:00Z',range)).toBe(false)
 expect(reportingWindow('week',at).start).toBe('2026-11-16');expect(reportingWindow('month',at).start).toBe('2026-11-01');expect(inReportingWindow('2026-11-23T00:00:00Z',reportingWindow('all',at))).toBe(false)
})
it('distinguishes unavailable data from a real empty set and fails duplicate or inconsistent source records',()=>{
 const base={clients,visits:[],runs:[],observations:[]};expect(operationalReport(base,'all',at).completed).toBe(0)
 expect(()=>operationalReport({...base,visits:undefined},'all',at)).toThrow('unavailable')
 const v={id:'v',outlet_id:'one',checked_in_at:'2026-11-22T00:00:00Z',checked_out_at:null}
 expect(()=>operationalReport({...base,visits:[v,v]},'all',at)).toThrow('Duplicate');expect(()=>operationalReport({...base,visits:[{...v,outlet_id:'missing'}]},'all',at)).toThrow('changed during refresh')
 expect(()=>operationalReport({...base,visits:[{...v,checked_out_at:'2026-11-21T00:00:00Z'}]},'all',at)).toThrow('precedes');expect(()=>operationalReport({...base,runs:[{id:'bad',outlet_id:'one',created_at:'bad-date'}]},'all',at)).toThrow('Invalid')
})
it('keeps recorded/sync-time cohorts explicit rather than backdating offline arrivals',()=>{
 const data={clients,visits:[{id:'later-sync',outlet_id:'one',checked_in_at:'2026-11-22T00:00:00Z',checked_out_at:'2026-11-22T00:05:00Z'}],runs:[],observations:[]}
 expect(operationalReport(data,'today',new Date('2026-11-21T10:00:00Z')).completed).toBe(0);expect(operationalReport(data,'today',at).completed).toBe(1)
})
