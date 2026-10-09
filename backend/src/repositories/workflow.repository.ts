import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getDatabasePool } from "../config/database.js";
import type { Workflow } from "../engine/types.js";

export interface WorkflowRecord {
  id: string;
  name: string;
  description: string | null;
  graph_definition: Workflow;
  version: number;
  created_at: string;
  updated_at: string;
}

interface WorkflowRow extends RowDataPacket {
  id: string;
  name: string;
  description: string | null;
  graph_definition: string | Workflow;
  version: number;
  created_at: string;
  updated_at: string;
}

export class WorkflowRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getDatabasePool();
  }

  async listWorkflows(): Promise<Array<Omit<WorkflowRecord, "graph_definition">>> {
    const [rows] = await this.pool.query<WorkflowRow[]>(
      "SELECT id, name, description, version, created_at, updated_at FROM workflows ORDER BY updated_at DESC"
    );

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      version: r.version,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  }

  async getWorkflowById(id: string): Promise<WorkflowRecord | null> {
    const [rows] = await this.pool.query<WorkflowRow[]>(
      "SELECT id, name, description, graph_definition, version, created_at, updated_at FROM workflows WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    const graphDefinition =
      typeof row.graph_definition === "string"
        ? (JSON.parse(row.graph_definition) as Workflow)
        : (row.graph_definition as Workflow);

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      graph_definition: graphDefinition,
      version: row.version,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async createWorkflow(
    id: string,
    name: string,
    description: string | null,
    graph: Workflow
  ): Promise<WorkflowRecord> {
    const graphJson = JSON.stringify(graph);
    await this.pool.query<ResultSetHeader>(
      "INSERT INTO workflows (id, name, description, graph_definition, version) VALUES (?, ?, ?, ?, 1)",
      [id, name, description, graphJson]
    );

    return {
      id,
      name,
      description,
      graph_definition: graph,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  async updateWorkflow(
    id: string,
    name: string,
    description: string | null,
    graph: Workflow,
    expectedVersion?: number
  ): Promise<{ updated: boolean; currentVersion?: number }> {
    const graphJson = JSON.stringify(graph);

    let query = "UPDATE workflows SET name = ?, description = ?, graph_definition = ?, version = version + 1 WHERE id = ?";
    const params: unknown[] = [name, description, graphJson, id];

    if (typeof expectedVersion === "number") {
      query += " AND version = ?";
      params.push(expectedVersion);
    }

    const [result] = await this.pool.query<ResultSetHeader>(query, params);

    if (result.affectedRows === 0) {
      const existing = await this.getWorkflowById(id);
      return { updated: false, currentVersion: existing?.version };
    }

    return { updated: true };
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    const [result] = await this.pool.query<ResultSetHeader>(
      "DELETE FROM workflows WHERE id = ?",
      [id]
    );
    return result.affectedRows > 0;
  }
}
