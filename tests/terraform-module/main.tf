locals {
  app_identifier = format("%s-%s-%s", var.app_name, var.environment, var.region)

  # can() with a valid expression.
  # With the old eval()-based implementation this incorrectly returned false
  # because eval("navigator-prod") throws ReferenceError.
  # With the new Parser.evalExpression() implementation it correctly returns true.
  can_valid_result = can(format("%s-%s", var.app_name, var.environment))

  # can() on a static value — always true regardless of implementation.
  can_static_result = can(var.app_name)
}
