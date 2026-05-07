import type { Category, CreateCategoryBody, UpdateCategoryBody } from "@workspace/api-client-react";
import { get, post, put, del } from "../fetch";

export const categories = {
  list: (): Promise<Category[]> =>
    get("/api/categories"),

  get: (id: number): Promise<Category> =>
    get(`/api/categories/${id}`),

  create: (body: CreateCategoryBody): Promise<Category> =>
    post("/api/categories", body),

  update: (id: number, body: UpdateCategoryBody): Promise<Category> =>
    put(`/api/categories/${id}`, body),

  delete: (id: number): Promise<void> =>
    del(`/api/categories/${id}`),
};
