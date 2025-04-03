# Streamlining Terraform and Terragrunt Workflows with Terragrunt Navigator

Managing Terraform and Terragrunt configurations can be a daunting task, especially when dealing with complex infrastructures. Enter the **Terragrunt Navigator**, a Visual Studio Code extension designed to simplify and enhance your workflow. In this blog, we’ll explore how this extension can transform the way you work with Terraform and Terragrunt.

## The Challenge

Terraform and Terragrunt are powerful tools for managing infrastructure as code. However, navigating through multiple `.hcl` and `.tf` files, understanding variable dependencies, and managing configurations can be time-consuming and error-prone. Developers often find themselves juggling between different tools and scripts to get the job done.

## The Solution: Terragrunt Navigator

The Terragrunt Navigator extension is a game-changer for developers working with Terraform and Terragrunt. It integrates seamlessly with Visual Studio Code, providing a suite of features that make managing configurations easier and more efficient.

### Key Features

1. **Document Links and Decorations**:
   - Automatically decorates and provides clickable links for `source` and `config_path` attributes in `.hcl` and `.tf` files.
   - Hover over variables or expressions to see their evaluated values in a tooltip.

2. **Git Integration**:
   - Automatically clones and opens Git repositories referenced in your Terragrunt configurations.

3. **Var replacement wit inputs when navigated using git url from terragrunt file**
   - When clicking on a module path referenced in the terragrunt file, repo will be cloned if its from git and the input values will be used to replace the variables. Hovering overing the variable will show the value fetched from input and the variable description. Input will not be passed if the terraform module is not navigated from the terragrunt. Another option to see the input value is to add the input.json with the values in the terraform module.

4. **Cache Management**:
   - Efficiently caches parsed terraform module to improve performance.
   - Automatically limits the cache size to avoid excessive memory usage.

3. **Quick Replacement Strings**:
   - Allows you to define and quickly replace strings in your configurations for the source path in terragrunt.

4. **Feature Toggles**:
   - Enable or disable specific features like string replacement or adding the Terragrunt cache to the workspace.

5. **Input JSON Management**:
   - Save inputs from your Terragrunt configurations into an `input.json` file for reuse.


## How to Get Started

### Installation

1. Install the Terragrunt Navigator extension from the Visual Studio Code marketplace.
2. Ensure you have the necessary dependencies like Git and Bash installed on your system.

### Activating the Extension

The extension activates automatically when you open a `.hcl` or `.tf` file in your workspace. You will see decorations and links appear in your editor.

### Commands

The extension provides several commands accessible via the Command Palette (`Ctrl+Shift+P`):

- **Quick Replace Strings Count**: Adjust the number of strings displayed for quick replacement.
- **Max Cache Size**: Set the maximum number of cache directories to retain.
- **Replacement Strings**: Define or update the strings to find and replace in your configurations.
- **Feature Toggles**: Enable or disable specific features of the extension.
- **Save Input JSON**: Save the inputs from the current configuration into an `input.json` file.

## Benefits

- **Improved Productivity**: Quickly navigate and edit Terragrunt configurations without leaving your editor.
- **Error Reduction**: Hover tooltips and decorations help you understand and debug configurations more effectively.
- **Seamless Git Integration**: Automatically clone and open repositories referenced in your configurations.
- **Customizable**: Tailor the extension to your workflow with feature toggles and replacement strings.

## A Day in the Life of a Developer Using Terragrunt Navigator

Imagine you’re tasked with updating a complex Terragrunt configuration. Here’s how the Terragrunt Navigator can make your life easier:

1. **Navigate with Ease**: Open a `.hcl` file and use the clickable links to jump directly to the referenced modules or configurations.
2. **Understand Dependencies**: Hover over variables to see their evaluated values and understand how they interact with other parts of the configuration.
3. **Save Time**: Use the `Save Input JSON` command to save inputs for reuse, reducing the need to re-enter data.
4. **Stay Organized**: Enable or disable features like string replacement via the `Feature Toggles` command to keep your workspace clean and efficient.

## Conclusion

The Terragrunt Navigator extension is more than just a tool; it’s a productivity booster for developers working with Terraform and Terragrunt. By simplifying navigation, enhancing understanding, and automating repetitive tasks, it allows you to focus on what truly matters—building and managing robust infrastructure.

Try the Terragrunt Navigator today and experience the difference it can make in your workflow. Happy coding!
