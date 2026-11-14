import Dexie, { type Table } from 'dexie'
import type {
  Outlet, Product, SurveyBrand, Visit, SurveyAnswer,
  Order, OrderLine, Payment, OutboxItem,
} from './types'

/** Local database on the phone. Everything the rep needs works from here. */
export class LocalDb extends Dexie {
  outlets!: Table<Outlet, string>
  products!: Table<Product, string>
  survey_brands!: Table<SurveyBrand, string>
  visits!: Table<Visit, string>
  survey_answers!: Table<SurveyAnswer, string>
  orders!: Table<Order, string>
  order_lines!: Table<OrderLine, string>
  payments!: Table<Payment, string>
  outbox!: Table<OutboxItem, number>

  constructor(name = 'shakarchi-distribution') {
    super(name)
    this.version(1).stores({
      outlets: 'id, assigned_rep, area, retail_name',
      products: 'id, product_line, active',
      survey_brands: 'id, active',
      visits: 'id, outlet_id, checked_in_at',
      survey_answers: 'id, visit_id',
      orders: 'id, visit_id, outlet_id',
      order_lines: 'id, order_id',
      payments: 'id, outlet_id, order_id',
      outbox: '++seq, table, row_id',
    })
  }
}

export const db = new LocalDb()
