Simplifying Terragrunt and Terraform Workflows with Terragrunt/Terraform Navigator
Managing Terraform and Terragrunt configurations can be a daunting task, especially when dealing with complex infrastructures with multiple terraform module and submodules. Enter the Terragrunt/Terraform Navigator, a Visual Studio Code extension designed to simplify and enhance your workflow. In this blog, we'll explore how this extension can transform the way you work with Terraform and Terragrunt.
The Challenge
Terraform and Terragrunt are powerful tools for managing infrastructure as code. However, navigating through multiple `.hcl` and `.tf` files, understanding variable dependencies, and managing configurations can be time-consuming and error-prone. Developers often find themselves juggling between different tools and scripts to get the job done.
The Solution: Terragrunt/Terraform Navigator
The Terragrunt/Terraform Navigator extension is a game-changer for developers working with Terraform and Terragrunt. It integrates seamlessly with Visual Studio Code, providing a suite of features that make managing configurations easier and more efficient.
Let's looks at a scenario a developer faces. Imagine you're tasked with updating a complex Terragrunt configuration with multiple terraform modules(and sub modules). You would typically start with the terragrunt file where you will have your module referenced. Here's how the Terragrunt Navigator can make your life easier.
Document Links and Decorations
With the extension installed, your file will be automatically decorated and provides clickable links, if any. The decoration will be with yellow, green and violet color like show in the image below. The text show in yellow color are clickable. The text shown in violet and green will show the values on hovering over it. Violet text will show the computed value like shown in the image. Hovering over var in terraform files show the variable value followed by its description like shown below. This will help in getting the final value without opening other files or computing it manually
Image 1: text decorated with different color
Image 2: var value shown with its value and description
Git repo navigation and caching
Imagine you have a source module referenced in your terragrunt configuration and if you want to know more about the module, you will have to clone the repo or go to the repo using a browser, right ? With this extension installed, now it's just a single click needed on the source link, the repo will be automatically cloned and added to the workspace. It will also switch to the module. BTW, you also have a feature toggle if you don't want to add the cloned repo into your workspace.
It doesn't stop there, while switching to the terraform module, the input values from the terragrunt also will be passed so that the var in the terraform module will also reflect the input passed from terragrunt. While hovering over the var, it will show the value that is passed from input or the default value if not passed along with the description of the variable so that you will be able to find out the details of the variable like type, description and default value without opening another file. Isn't it cool!!!
These two features mentioned above significantly speed up the way working with terragrunt and terraform. This also avoid any confusion and losing your way when dealing with multiple submodules. There are few more features added in the extension like caching of the terraform module to speed up subsequent access and the following one via the Command Palette (`Ctrl+Shift+P`)
Support for string replacement of source path
Toggling features 
Saving inputs from terragrunt config in json format

How to Get Started
Installation
Install the Terragrunt Navigator extension from the Visual Studio Code marketplace. Terragrunt/Terraform Navigator - Visual Studio Marketplace
Ensure you have the necessary dependencies like Git and Bash installed on your system.

Activating the Extension
The extension activates automatically when you open a `.hcl` or `.tf` file in your workspace. You will see decorations and links appear in your editor.
Benefits
Improved Productivity: Quickly navigate and edit Terragrunt configurations without leaving your editor.
Error Reduction: Hover tooltips and decorations help you understand and debug configurations more effectively.
Seamless Git Integration: Automatically clone and open repositories referenced in your configurations.
Customizable: Tailor the extension to your workflow with feature toggles and replacement strings.

Conclusion
The Terragrunt Navigator extension is more than just a tool; it's a productivity booster for developers working with Terraform and Terragrunt. By simplifying navigation, enhancing understanding, and automating repetitive tasks, it allows you to focus on what truly matters - building and managing robust infrastructure.
Try the Terragrunt Navigator today and experience the difference it can make in your workflow. Happy coding!
Bugs or feature requests can be added here Issues · HPInc/terragrunt-navigator [ Please note this is a side project and expect delays ]
