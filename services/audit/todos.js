import { ObjectId } from "mongodb";
import { getCollections } from "../db/mongodb.js";

const ALLOWED_STATUSES = [
  "new",
  "open",
  "planned",
  "in_progress",
  "blocked",
  "done",
  "ignored"
];

const LEGACY_STATUS_MAP = {
  todo: "new",
  open: "open",
  planned: "planned",
  in_progress: "in_progress",
  progress: "in_progress",
  blocked: "blocked",
  done: "done",
  complete: "done",
  completed: "done",
  ignored: "ignored",
  ignore: "ignored"
};

export async function createTodo({
  ownerKey = "public:anonymous",
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
  status = "new",
  priority = null,
  dueDate = null,
  plannedFor = null,
  source = "manual",
  notes = "",
  returnTo = ""
}) {
  const { auditTodos } = await getCollections();
  const now = new Date();

  const normalisedStatus = normaliseStatus(status);
  const normalisedPriority = normalisePriority(priority || severity);

  const document = {
    ownerKey,
    auditRunId: toObjectIdOrNull(auditRunId),
    pageUrl: safeString(pageUrl),
    pageTitle: safeString(pageTitle),
    category: safeString(category),
    checkName: safeString(checkName),
    severity: safeString(severity || normalisedPriority),
    priority: normalisedPriority,
    message: safeString(message),
    recommendation: safeString(recommendation),
    evidence: safeString(evidence),
    why: safeString(why),
    how: safeString(how),
    example: safeString(example),
    businessImpact: safeString(businessImpact),
    implementationHint: safeString(implementationHint),
    expectedImpact: safeString(expectedImpact),
    effort: safeString(effort),
    status: normalisedStatus,
    notes: safeString(notes),
    source: safeString(source || "manual"),
    returnTo: safeString(returnTo),
    dueDate: toDateOrNull(dueDate),
    plannedFor: toDateOrNull(plannedFor),
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    resolvedAt: normalisedStatus === "done" ? now : null,
    completedAt: normalisedStatus === "done" ? now : null
  };

  const filter = {
    ownerKey: document.ownerKey,
    auditRunId: document.auditRunId,
    pageUrl: document.pageUrl,
    category: document.category,
    checkName: document.checkName
  };

  await auditTodos.updateOne(
    filter,
    {
      $setOnInsert: document,
      $set: {
        lastSeenAt: now,
        updatedAt: now,
        message: document.message,
        recommendation: document.recommendation,
        evidence: document.evidence,
        why: document.why,
        how: document.how,
        example: document.example,
        businessImpact: document.businessImpact,
        implementationHint: document.implementationHint,
        expectedImpact: document.expectedImpact,
        effort: document.effort,
        severity: document.severity,
        priority: document.priority,
        source: document.source,
        returnTo: document.returnTo
      }
    },
    {
      upsert: true
    }
  );

  return auditTodos.findOne(filter);
}

export async function getTodosForAuditRun(auditRunId, ownerKey = null) {
  const { auditTodos } = await getCollections();

  if (!ObjectId.isValid(auditRunId)) {
    return [];
  }

  const query = {
    auditRunId: new ObjectId(auditRunId)
  };

  if (ownerKey) {
    query.ownerKey = ownerKey;
  }

  return auditTodos
    .find(query)
    .sort({
      statusSort: 1,
      prioritySort: 1,
      createdAt: -1
    })
    .toArray()
    .then(sortTodos);
}

export async function getTodosForOwner(ownerKey, options = {}) {
  const { auditTodos } = await getCollections();

  const {
    status = null,
    priority = null,
    limit = 100,
    includeDone = true,
    dueOnly = false,
    pageUrl = null
  } = options;

  const query = {
    ownerKey
  };

  if (status) {
    query.status = normaliseStatus(status);
  }

  if (priority) {
    query.priority = normalisePriority(priority);
  }

  if (!includeDone) {
    query.status = {
      $nin: ["done", "ignored"]
    };
  }

  if (dueOnly) {
    query.dueDate = {
      $ne: null,
      $lte: new Date()
    };
    query.status = {
      $nin: ["done", "ignored"]
    };
  }

  if (pageUrl) {
    query.pageUrl = safeString(pageUrl);
  }

  const todos = await auditTodos
    .find(query)
    .sort({
      dueDate: 1,
      updatedAt: -1
    })
    .limit(Number(limit) || 100)
    .toArray();

  return sortTodos(todos);
}

export async function getPlannedTodos(ownerKey, limit = 100) {
  return getTodosForOwner(ownerKey, {
    status: "planned",
    limit,
    includeDone: false
  });
}

export async function getDueTodos(ownerKey, limit = 100) {
  const { auditTodos } = await getCollections();

  const todos = await auditTodos
    .find({
      ownerKey,
      status: {
        $nin: ["done", "ignored"]
      },
      dueDate: {
        $ne: null,
        $lte: new Date()
      }
    })
    .sort({
      dueDate: 1,
      priority: 1,
      updatedAt: -1
    })
    .limit(Number(limit) || 100)
    .toArray();

  return sortTodos(todos);
}

export async function updateTodoStatus({
  todoId,
  status,
  dueDate = null,
  plannedFor = null,
  notes = null,
  ownerKey = null
}) {
  const { auditTodos } = await getCollections();

  if (!ObjectId.isValid(todoId)) {
    return null;
  }

  const normalisedStatus = normaliseStatus(status);
  const now = new Date();

  const update = {
    status: normalisedStatus,
    updatedAt: now
  };

  if (dueDate !== null) {
    update.dueDate = toDateOrNull(dueDate);
  }

  if (plannedFor !== null) {
    update.plannedFor = toDateOrNull(plannedFor);
  }

  if (notes !== null) {
    update.notes = safeString(notes);
  }

  if (normalisedStatus === "done") {
    update.resolvedAt = now;
    update.completedAt = now;
  } else {
    update.resolvedAt = null;
    update.completedAt = null;
  }

  const query = {
    _id: new ObjectId(todoId)
  };

  if (ownerKey) {
    query.ownerKey = ownerKey;
  }

  await auditTodos.updateOne(
    query,
    {
      $set: update
    }
  );

  return auditTodos.findOne(query);
}

export async function updateTodoPlanning({
  todoId,
  status = "planned",
  dueDate = null,
  plannedFor = null,
  notes = null,
  ownerKey = null
}) {
  return updateTodoStatus({
    todoId,
    status,
    dueDate,
    plannedFor,
    notes,
    ownerKey
  });
}

export async function updateTodoDetails({
  todoId,
  ownerKey = null,
  title = null,
  pageTitle = null,
  message = null,
  recommendation = null,
  evidence = null,
  why = null,
  how = null,
  example = null,
  businessImpact = null,
  implementationHint = null,
  expectedImpact = null,
  effort = null,
  priority = null,
  severity = null,
  dueDate = null,
  plannedFor = null,
  notes = null
}) {
  const { auditTodos } = await getCollections();

  if (!ObjectId.isValid(todoId)) {
    return null;
  }

  const update = {
    updatedAt: new Date()
  };

  assignIfProvided(update, "checkName", title);
  assignIfProvided(update, "pageTitle", pageTitle);
  assignIfProvided(update, "message", message);
  assignIfProvided(update, "recommendation", recommendation);
  assignIfProvided(update, "evidence", evidence);
  assignIfProvided(update, "why", why);
  assignIfProvided(update, "how", how);
  assignIfProvided(update, "example", example);
  assignIfProvided(update, "businessImpact", businessImpact);
  assignIfProvided(update, "implementationHint", implementationHint);
  assignIfProvided(update, "expectedImpact", expectedImpact);
  assignIfProvided(update, "effort", effort);
  assignIfProvided(update, "notes", notes);

  if (priority !== null) {
    update.priority = normalisePriority(priority);
  }

  if (severity !== null) {
    update.severity = safeString(severity);
  }

  if (dueDate !== null) {
    update.dueDate = toDateOrNull(dueDate);
  }

  if (plannedFor !== null) {
    update.plannedFor = toDateOrNull(plannedFor);
  }

  const query = {
    _id: new ObjectId(todoId)
  };

  if (ownerKey) {
    query.ownerKey = ownerKey;
  }

  await auditTodos.updateOne(query, {
    $set: update
  });

  return auditTodos.findOne(query);
}

export async function deleteTodo(todoId, ownerKey = null) {
  const { auditTodos } = await getCollections();

  if (!ObjectId.isValid(todoId)) {
    return {
      deletedCount: 0
    };
  }

  const query = {
    _id: new ObjectId(todoId)
  };

  if (ownerKey) {
    query.ownerKey = ownerKey;
  }

  return auditTodos.deleteOne(query);
}

export async function getTodoSummaryForAuditRun(auditRunId, ownerKey = null) {
  const todos = await getTodosForAuditRun(auditRunId, ownerKey);
  return buildTodoSummary(todos);
}

export async function getTodoSummaryForOwner(ownerKey) {
  const todos = await getTodosForOwner(ownerKey, {
    limit: 1000,
    includeDone: true
  });

  return buildTodoSummary(todos);
}

export async function getTodoImpactSummary(ownerKey) {
  const { auditTodos } = await getCollections();

  const completedTodos = await auditTodos
    .find({
      ownerKey,
      status: "done",
      completedAt: {
        $ne: null
      }
    })
    .sort({
      completedAt: -1
    })
    .limit(50)
    .toArray();

  const openHighPriority = await auditTodos.countDocuments({
    ownerKey,
    status: {
      $nin: ["done", "ignored"]
    },
    priority: {
      $in: ["critical", "high"]
    }
  });

  const dueCount = await auditTodos.countDocuments({
    ownerKey,
    status: {
      $nin: ["done", "ignored"]
    },
    dueDate: {
      $ne: null,
      $lte: new Date()
    }
  });

  return {
    completedRecently: completedTodos.length,
    openHighPriority,
    dueCount,
    latestCompleted: completedTodos.slice(0, 10)
  };
}

function buildTodoSummary(todos) {
  const now = new Date();

  return {
    total: todos.length,
    new: todos.filter((todo) => todo.status === "new").length,
    open: todos.filter((todo) => todo.status === "open").length,
    planned: todos.filter((todo) => todo.status === "planned").length,
    inProgress: todos.filter((todo) => todo.status === "in_progress").length,
    blocked: todos.filter((todo) => todo.status === "blocked").length,
    done: todos.filter((todo) => todo.status === "done").length,
    ignored: todos.filter((todo) => todo.status === "ignored").length,
    active: todos.filter((todo) => !["done", "ignored"].includes(todo.status)).length,
    overdue: todos.filter((todo) => {
      if (!todo.dueDate || ["done", "ignored"].includes(todo.status)) return false;
      return new Date(todo.dueDate) < now;
    }).length,
    dueThisWeek: todos.filter((todo) => {
      if (!todo.dueDate || ["done", "ignored"].includes(todo.status)) return false;

      const dueDate = new Date(todo.dueDate);
      const weekFromNow = new Date(now);
      weekFromNow.setDate(now.getDate() + 7);

      return dueDate >= now && dueDate <= weekFromNow;
    }).length,
    critical: todos.filter((todo) => todo.priority === "critical").length,
    high: todos.filter((todo) => todo.priority === "high").length,
    medium: todos.filter((todo) => todo.priority === "medium").length,
    low: todos.filter((todo) => todo.priority === "low").length
  };
}

function sortTodos(todos) {
  const statusWeight = {
    blocked: 0,
    new: 1,
    open: 2,
    planned: 3,
    in_progress: 4,
    done: 5,
    ignored: 6
  };

  const priorityWeight = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3
  };

  return [...todos].sort((a, b) => {
    const statusDiff =
      (statusWeight[a.status] ?? 99) - (statusWeight[b.status] ?? 99);

    if (statusDiff !== 0) return statusDiff;

    const priorityDiff =
      (priorityWeight[a.priority] ?? 99) - (priorityWeight[b.priority] ?? 99);

    if (priorityDiff !== 0) return priorityDiff;

    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;

    if (aDue !== bDue) return aDue - bDue;

    return new Date(b.updatedAt || b.createdAt).getTime() -
      new Date(a.updatedAt || a.createdAt).getTime();
  });
}

function normaliseStatus(status) {
  const clean = safeString(status || "new").trim().toLowerCase();
  const mapped = LEGACY_STATUS_MAP[clean] || clean;

  if (!ALLOWED_STATUSES.includes(mapped)) {
    throw new Error(
      `Invalid todo status "${status}". Allowed statuses: ${ALLOWED_STATUSES.join(", ")}.`
    );
  }

  return mapped;
}

function normalisePriority(priority) {
  const clean = safeString(priority || "medium").trim().toLowerCase();

  if (["critical", "urgent"].includes(clean)) return "critical";
  if (["high", "major"].includes(clean)) return "high";
  if (["medium", "moderate", "med"].includes(clean)) return "medium";
  if (["low", "minor", "info", "positive"].includes(clean)) return "low";

  return "medium";
}

function toObjectIdOrNull(value) {
  if (!value) return null;
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function toDateOrNull(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function safeString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function assignIfProvided(target, key, value) {
  if (value !== null && value !== undefined) {
    target[key] = safeString(value);
  }
}