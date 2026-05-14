import { AuthService } from "../../src/services/auth.service";
import { prisma } from "../../src/config/prisma";
import {
  ConflictError,
  UnauthorizedError,
  BadRequestError,
} from "../../src/utils/errors";
import bcrypt from "bcrypt";

// 1. Мокаем config/queue, так как AuthService берет функции оттуда
jest.mock("../../src/config/queue", () => ({
  emailQueue: { add: jest.fn().mockResolvedValue({ id: "mock-job" }) },
  enqueueVerificationEmail: jest.fn(() => Promise.resolve()),
  enqueuePasswordResetEmail: jest.fn(() => Promise.resolve()),
}));

// 2. Мокаем Prisma
jest.mock("../../src/config/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockUser = prisma.user as any;
const { enqueueVerificationEmail, enqueuePasswordResetEmail } = require("../../src/config/queue");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AuthService.register", () => {
  it("бросает ConflictError если email уже занят", async () => {
    mockUser.findUnique.mockResolvedValue({ id: "existing" } as any);
    await expect(
      AuthService.register({ email: "a@a.com", name: "A", password: "Test1234!" })
    ).rejects.toThrow(ConflictError);
  });

  it("создаёт пользователя и хеширует пароль", async () => {
    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockResolvedValue({
      id: "new", email: "a@a.com", name: "A", role: "RECIPIENT",
    } as any);

    await AuthService.register({ email: "a@a.com", name: "A", password: "Test1234!" });

    expect(mockUser.create).toHaveBeenCalled();
    const createArg = mockUser.create.mock.calls[0][0];
    const valid = await bcrypt.compare("Test1234!", createArg.data.passwordHash);
    expect(valid).toBe(true);
  });

  it("ставит в очередь письмо verify-email", async () => {
    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockResolvedValue({ id: "new", email: "a@a.com", name: "A" } as any);

    await AuthService.register({ email: "a@a.com", name: "A", password: "Test1234!" });
    expect(enqueueVerificationEmail).toHaveBeenCalled();
  });
});

describe("AuthService.forgotPassword", () => {
  it("сохраняет resetToken и вызывает очередь", async () => {
    mockUser.findUnique.mockResolvedValue({
      id: "id", email: "x@x.com", name: "X", isActive: true, isEmailVerified: true,
    } as any);
    mockUser.update.mockResolvedValue({} as any);

    const result = await AuthService.forgotPassword("x@x.com");
    
    expect(result.message).toContain("If that email is registered");
    expect(mockUser.update).toHaveBeenCalled();
    expect(enqueuePasswordResetEmail).toHaveBeenCalled();

    const updateArg = mockUser.update.mock.calls[0][0];
    expect(updateArg.data.passwordResetExpiresAt).toBeInstanceOf(Date);
    // Проверка на 15 минут (как в твоем AuthService)
    const diff = updateArg.data.passwordResetExpiresAt.getTime() - Date.now();
    expect(diff).toBeGreaterThan(14 * 60 * 1000); 
  });
});

describe("AuthService.verifyEmail", () => {
  it("бросает BadRequestError если токен не найден", async () => {
    mockUser.findMany.mockResolvedValue([]);
    await expect(AuthService.verifyEmail("token")).rejects.toThrow(BadRequestError);
  });
});