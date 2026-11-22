import {handleAdvisor} from '../server/advisor-handler'
export const maxDuration=60
export default {fetch(request:Request){return handleAdvisor(request)}}
