import { describe, expect, it } from "vitest";
import {
  deliveryFromProvider,
  missingTemplateValues,
  renderTemplate,
  sendFailureKind,
  unknownTemplateVariables,
  unsupportedPersonalClaims,
} from "./email-studio.js";

describe("email studio", () => {
  it("rejects unknown variables and leaves missing values unreplaced", () => {
    const body = "Hi {{first_name}} at {{company_name}} from {{secret}}";
    expect(unknownTemplateVariables(body)).toEqual(["secret"]);
    expect(missingTemplateValues("Hi {{first_name}}", { first_name: " " })).toEqual(["first_name"]);
    expect(renderTemplate("Hi {{first_name}}", { first_name: "Ada" })).toBe("Hi Ada");
  });

  it("flags unsupported relationship claims and never treats acceptance as delivery", () => {
    expect(unsupportedPersonalClaims("As we discussed yesterday", "Ada leads operations.")).toHaveLength(1);
    expect(unsupportedPersonalClaims("As we discussed yesterday", "As we discussed yesterday")).toEqual([]);
    expect(deliveryFromProvider({ httpStatus: 202 })).toBe("accepted");
    expect(deliveryFromProvider({ httpStatus: 200, explicitState: "delivered" })).toBe("delivered");
    expect(sendFailureKind("timeout")).toBe("reconcile");
    expect(sendFailureKind(429)).toBe("retry");
    expect(sendFailureKind(400)).toBe("fail");
  });
});
