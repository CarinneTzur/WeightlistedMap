import { forwardRef } from "react";

export const ScrollArea = forwardRef(function ScrollArea({ as: Element = "div", className = "", style, ...props }, ref) {
 return <Element ref={ref} className={`ui-scroll-area ${className}`} style={{ overflow: "auto", minHeight: 0, ...style }} {...props} />;
});

export const Button = forwardRef(function Button({ className = "", type = "button", ...props }, ref) {
 return <button ref={ref} type={type} className={`ui-button ${className}`} {...props} />;
});
