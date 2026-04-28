import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    err.issues.forEach((issue) => {
      const key = issue.path.join(".") || "value";
      if (!errors[key]) errors[key] = [];
      errors[key].push(issue.message);
    });
    res.status(422).json({ success: false, message: "Validation failed", errors });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }

  if ("code" in err && (err as any).code === "P2002") {
    res.status(409).json({ success: false, message: "Resource already exists" });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: "Internal server error" });
}