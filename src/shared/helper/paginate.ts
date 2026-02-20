import { count, InferSelectModel, SQL } from 'drizzle-orm';
import { PgDatabase, PgTable } from 'drizzle-orm/pg-core';

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export class QueryPaginator<TModel> {
  private _page = 1;
  private _pageSize = 20;
  private _where?: SQL;
  private _orderBy?: SQL;

  constructor(
    private readonly db: PgDatabase<any, any, any>,
    private readonly table: PgTable,
  ) {}

  page(p: number) {
    this._page = Math.max(p, 1);
    return this;
  }

  pageSize(l: number) {
    this._pageSize = Math.min(Math.max(l, 1), 100);
    return this;
  }

  where(w: SQL) {
    this._where = w;
    return this;
  }

  orderBy(o: SQL) {
    this._orderBy = o;
    return this;
  }

  async execute(): Promise<{ data: TModel[]; meta: PaginationMeta }> {
    const offset = (this._page - 1) * this._pageSize;

    // ---------- DATA QUERY ----------
    const baseQuery = this.db.select().from(this.table);

    const filteredQuery = this._where
      ? baseQuery.where(this._where)
      : baseQuery;

    const orderedQuery = this._orderBy
      ? filteredQuery.orderBy(this._orderBy)
      : filteredQuery;

    const data = await orderedQuery.offset(offset).limit(this._pageSize);

    // ---------- COUNT QUERY ----------
    const countBase = this.db.select({ total: count() }).from(this.table);

    const countQuery = this._where ? countBase.where(this._where) : countBase;

    const countResult = await countQuery;
    const total = Number(countResult[0]?.total ?? 0);

    const totalPages = Math.ceil(total / this._pageSize);

    return {
      data: data as TModel[],
      meta: {
        total,
        page: this._page,
        pageSize: this._pageSize,
        totalPages,
        hasNext: this._page < totalPages,
        hasPrev: this._page > 1,
      },
    };
  }
}

export function paginate<T extends PgTable>(
  db: PgDatabase<any, any, any>,
  table: T,
) {
  return new QueryPaginator<InferSelectModel<T>>(db, table);
}
