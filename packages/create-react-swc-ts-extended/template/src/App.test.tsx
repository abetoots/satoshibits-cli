import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders without crashing", () => {
    //Arrange
    render(<App />);

    //Act
    const element = screen.getByText("count is 0");

    //Assert
    expect(element).toBeInTheDocument();
  });
});
