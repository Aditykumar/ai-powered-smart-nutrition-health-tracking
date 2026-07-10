import { Router } from "express";

export const coachRouter = Router();

coachRouter.post("/ask", (req, res) => {
  const { question } = req.body as { question?: string };

  res.json({
    answer:
      question?.trim()
        ? `Thanks for asking about "${question}". This starter project will later route that to an AI nutrition coach.`
        : "Send a nutrition question to get a reply.",
  });
});
