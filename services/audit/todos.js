import { ObjectId } from "mongodb";
import { getCollections } from "../db/mongodb.js";

export async function createTodo({
  auditRunId,
  pageUrl,
  pageTitle,
  category,
  checkName,
  severity,
  message,
  recommendation,
  evidence,
  why,
  how,
  example,
  businessImpact,
  implementationHint,
  expectedImpact,
  effort,
  returnTo
}) {
  const { auditTodos } = await getCollections();

  const now = new Date();

  const document = {
    auditRunId: ObjectId.isValid(auditRunId) ? new ObjectId(auditRunId) : null,
    pageUrl,
    pageTitle,
    category,
    checkName,
    severity,
    message,
    recommendation,
    evidence,
    why,
    how,
    example,
    businessImpact,
    implementationHint,
    expectedImpact,
    effort,
    status: "open",
    notes: "",
    returnTo: returnTo || "",
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    resolvedAt: null
  };

  const filter = {
    auditRunId: document.auditRunId,
    pageUrl,
    category,
    checkName
  };

  await auditTodos.updateOne(
    filter,
    {
      $setOnInsert: document,
      $set: {
        lastSeenAt: now,
        updatedAt: now
      }
    },
    { upsert: true }
  );

  return auditTodos.findOne(filter);
}

export async function getTodosForAuditRun(auditRunId) {
  const { auditTodos } = await getCollections();

  if (!ObjectId.isValid(auditRunId)) {
    return [];
  }

  return auditTodos
    .find({
      auditRunId: new ObjectId(auditRunId)
    })
    .sort({
      status: 1,
      createdAt: -1
    })
    .toArray();
}

export async function updateTodoStatus({ todoId, status }) {
  const { auditTodos } = await getCollections();

  if (!ObjectId.isValid(todoId)) {
    return null;
  }

  const allowedStatuses = ["open", "in_progress", "done", "ignored"];

  if (!allowedStatuses.includes(status)) {
    throw new Error("Invalid todo status.");
  }

  const now = new Date();

  const update = {
    status,
    updatedAt: now
  };

  if (status === "done") {
    update.resolvedAt = now;
  }

  if (status !== "done") {
    update.resolvedAt = null;
  }

  await auditTodos.updateOne(
    {
      _id: new ObjectId(todoId)
    },
    {
      $set: update
    }
  );

  return auditTodos.findOne({
    _id: new ObjectId(todoId)
  });
}

export async function getTodoSummaryForAuditRun(auditRunId) {
  const todos = await getTodosForAuditRun(auditRunId);

  return {
    total: todos.length,
    open: todos.filter((todo) => todo.status === "open").length,
    inProgress: todos.filter((todo) => todo.status === "in_progress").length,
    done: todos.filter((todo) => todo.status === "done").length,
    ignored: todos.filter((todo) => todo.status === "ignored").length
  };
}
