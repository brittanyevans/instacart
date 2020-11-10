const transformData = (
  aisles,
  departments,
  orderProducts,
  products,
  orders
) => {
  // aisle names for lookup when looping through products
  const aisleNames = {}; // {aisleId: aisleName}
  aisles.forEach((row) => {
    aisleNames[row.aisleId] = row.aisle;
  });

  // The data in the sunburst format
  var nodeData = {
    name: "DEPARTMENTS",
    children: [],
  };

  // Loop through the departments to get the top level data
  departments.forEach((row) => {
    nodeData.children.push({
      name: row.department,
      id: row.departmentId,
      children: [],
    });
  });

  const productOrderCount = {};
  const productReorderCount = {};
  const productFirstInCartCount = {};
  let totalNewProductPurchases = 0;
  let totalReorderedProductPurchases = 0;

  orderProducts.forEach((order) => {
    if (order.productId in productOrderCount) {
      productOrderCount[order.productId] += 1;
    } else {
      productOrderCount[order.productId] = 1;
    }

    if (order.reordered === "1") {
      totalReorderedProductPurchases++;
      if (order.productId in productReorderCount) {
        productReorderCount[order.productId] += 1;
      } else {
        productReorderCount[order.productId] = 1;
      }
    } else {
      totalNewProductPurchases++;
    }

    if (order.addToCartOrder === "1") {
      if (order.productId in productFirstInCartCount) {
        productFirstInCartCount[order.productId]++;
      } else {
        productFirstInCartCount[order.productId] = 1;
      }
    }
  });

  const productNames = {};

  products.forEach((row) => {
    productNames[row.productId] = row.productName;
    const department = nodeData.children.find(
      (dep) => dep.id === row.departmentId
    );
    const aisle = department.children.find((a) => a.id === row.aisleId);
    const product = {
      name: row.productName,
      id: row.productId,
      count:
        row.productId in productOrderCount
          ? productOrderCount[row.productId]
          : 0,
    };

    if (aisle) {
      aisle.children.push(product);
    } else {
      department.children.push({
        name: aisleNames[row.aisleId],
        id: row.aisleId,
        children: [product],
      });
    }
  });

  // shape = {numberOfHoursSinceSundayAtMidnight: countOfOrders}
  const orderByHourCount = {};
  const userFreq = {};
  orders.forEach((order) => {
    const time = order.orderDOW * 24 + order.orderHOD;
    if (time in orderByHourCount) {
      orderByHourCount[time]++;
    } else {
      orderByHourCount[time] = 1;
    }
    if (order.userID in userFreq) {
      userFreq[order.userId] = Math.max(
        +order.orderNumber,
        userFreq[order.userId]
      );
    } else {
      userFreq[order.userId] = +order.orderNumber;
    }
  });

  return {
    nodeData,
    productOrderCount,
    productNames,
    orderByHourCount,
    productReorderCount,
    totalNewProductPurchases,
    totalReorderedProductPurchases,
    userFreq,
    productFirstInCartCount,
  };
};
const generateSunburst = (nodeData) => {
  // start sunburst visualization
  var width = 650;
  var height = 650;
  var radius = Math.min(width, height) / 2;
  var color = d3.scaleOrdinal(d3.schemeAccent);
  let sequence = [];
  let percentage = 0;

  // create partition function to calculate arc
  const partition = (data) =>
    d3.partition().size([2 * Math.PI, radius * radius])(
      d3
        .hierarchy(data)
        .sum((d) => d.count)
        .sort((a, b) => b.count - a.count)
    );

  // find the root node
  var root = partition(nodeData);

  const svg = d3.select("svg#sunburst");
  // Make this into a view, so that the currently hovered sequence is available to the breadcrumb
  const element = svg.node();
  element.value = { sequence: [], percentage: 0.0 };

  const label = svg
    .append("text")
    .attr("text-anchor", "middle")
    .attr("fill", "#888")
    .style("visibility", "hidden");

  label
    .append("tspan")
    .attr("class", "percentage")
    .attr("x", 0)
    .attr("y", 0)
    .attr("dy", "-0.1em")
    .attr("font-size", "3em")
    .text("");

  label
    .append("tspan")
    .attr("class", "label-description")
    .attr("x", 0)
    .attr("y", 0)
    .attr("dy", "1.5em")
    .text("of purchases are from this category");

  svg
    .attr("viewBox", `${-radius} ${-radius} ${width} ${width}`)
    .style("max-width", `${width}px`)
    .style("font", "12px sans-serif");

  // calculate each arc
  const arc = d3
    .arc()
    .startAngle((d) => d.x0)
    .endAngle((d) => d.x1)
    .padAngle(1 / radius)
    .padRadius(radius)
    .innerRadius((d) => Math.sqrt(d.y0))
    .outerRadius((d) => Math.sqrt(d.y1) - 1);

  const mousearc = d3
    .arc()
    .startAngle((d) => d.x0)
    .endAngle((d) => d.x1)
    .innerRadius((d) => Math.sqrt(d.y0))
    .outerRadius(radius);

  const path = svg
    .append("g")
    .selectAll("path")
    .data(
      root.descendants().filter((d) => {
        // Don't draw the root node, and for efficiency, filter out nodes that would be too small to see
        return d.depth && d.x1 - d.x0 > 0.001;
      })
    )
    .join("path")
    .attr("fill", (d) => color(d.data.name))
    .attr("d", arc);

  svg
    .append("g")
    .attr("fill", "none")
    .attr("pointer-events", "all")
    .on("mouseleave", () => {
      path.attr("fill-opacity", 1);
      label.style("visibility", "hidden");
      // Update the value of this view
      element.value = { sequence: [], percentage: 0.0 };
      element.dispatchEvent(new CustomEvent("clean"));
    })
    .selectAll("path")
    .data(
      root.descendants().filter((d) => {
        // Don't draw the root node, and for efficiency, filter out nodes that would be too small to see
        return d.depth && d.x1 - d.x0 > 0.001;
      })
    )
    .join("path")
    .attr("d", mousearc)
    .on("mouseenter", (event, d) => {
      // Get the ancestors of the current segment, minus the root
      sequence = d.ancestors().reverse().slice(1);
      // Highlight the ancestors
      path.attr("fill-opacity", (node) =>
        sequence.indexOf(node) >= 0 ? 1.0 : 0.3
      );
      percentage = ((100 * d.value) / root.value).toPrecision(3);
      label
        .style("visibility", null)
        .select(".percentage")
        .text(percentage + "%");
      const categoryLabel = ["department", "aisle", "product"];
      label
        .select(".label-description")
        .text(`of purchases are from this ${categoryLabel[d.depth - 1]}`);
      // Update the value of this view with the currently hovered sequence and percentage
      element.value = { sequence, percentage };
      element.dispatchEvent(
        new CustomEvent("input", {
          detail: {
            sequence,
            percentage: d.value,
          },
        })
      );
    });

  return { element };
};
const generateBreadcrumbs = (sunburst) => {
  cleanBreadcrumbs();
  const breadcrumbWidth = 250;
  const breadcrumbHeight = 30;
  const color = d3.scaleOrdinal(d3.schemeAccent);
  const breadcrumbPoints = (d, i) => {
    const tipWidth = 10;
    const points = [];
    points.push("0,0");
    points.push(`${breadcrumbWidth},0`);
    points.push(`${breadcrumbWidth + tipWidth},${breadcrumbHeight / 2}`);
    points.push(`${breadcrumbWidth},${breadcrumbHeight}`);
    points.push(`0,${breadcrumbHeight}`);
    if (i > 0) {
      // Leftmost breadcrumb; don't include 6th vertex.
      points.push(`${tipWidth},${breadcrumbHeight / 2}`);
    }
    return points.join(" ");
  };

  const svg = d3
    .select("svg#breadcrumbs")
    .attr("viewBox", `0 0 ${breadcrumbWidth * 4} ${breadcrumbHeight}`)
    .style("font", "12px sans-serif")
    .style("margin", "5px");

  const g = svg
    .selectAll("g")
    .data(sunburst.sequence)
    .join("g")
    .attr("transform", (d, i) => `translate(${i * breadcrumbWidth}, 0)`);

  g.append("polygon")
    .attr("points", breadcrumbPoints)
    .attr("fill", (d) => color(d.data.name))
    .attr("stroke", "white");

  g.append("text")
    .attr("x", (breadcrumbWidth + 10) / 2)
    .attr("y", (breadcrumbHeight - 5) / 2)
    .attr("dy", ".6em")
    .attr("text-anchor", "middle")
    .attr("fill", "white")
    .text((d) => d.data.name);

  svg
    .append("text")
    .text(sunburst.percentage > 0 ? sunburst.percentage + " items sold" : "")
    .attr("x", (sunburst.sequence.length + 0.5) * breadcrumbWidth)
    .attr("y", breadcrumbHeight / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "middle");
};
const cleanBreadcrumbs = () => {
  const svg = d3.select("svg#breadcrumbs");
  svg.selectAll("*").remove();
};
const generatePopularProducts = (productOrderCount, productNames) => {
  const topTenProducts = Object.entries(productOrderCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id, count]) => [productNames[id], count]);

  const margin = { top: 30, right: 30, bottom: 150, left: 60 },
    width = 560 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;

  const svg = d3
    .select("svg#popular-products")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  var x = d3
    .scaleBand()
    .range([0, width])
    .domain(topTenProducts.map(([name, value]) => name))
    .padding(0.2);
  svg
    .append("g")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("transform", "translate(-10,0)rotate(-45)")
    .style("text-anchor", "end")
    .style("font-size", "14px");

  var y = d3.scaleLinear().domain([0, 3000]).range([height, 0]);
  svg.append("g").call(d3.axisLeft(y));

  // Bars
  svg
    .selectAll("rect")
    .data(topTenProducts)
    .enter()
    .append("rect")
    .attr("x", function ([name, count]) {
      return x(name);
    })
    .attr("y", function ([name, count]) {
      return y(count);
    })
    .attr("width", x.bandwidth())
    .attr("height", function ([name, count]) {
      return height - y(count);
    })
    .attr("fill", "#bf5b17");

  svg
    .append("text")
    .attr("class", "x label")
    .attr("text-anchor", "middle")
    .attr("x", width / 2)
    .attr("y", height + 150)
    .text("Product Name")
    .style("fill", "#888")
    .style("font-size", "14px");

  svg
    .append("text")
    .attr("class", "y label")
    .attr("text-anchor", "middle")
    .attr("y", -60)
    .attr("x", -(height / 2))
    .attr("dy", ".75em")
    .attr("transform", "rotate(-90)")
    .text("Count")
    .style("fill", "#888")
    .style("font-size", "14px");
};
const generateReorderedProducts = (
  totalNewProductPurchases,
  totalReorderedProductPurchases
) => {
  const data = [
    {
      name: "New",
      value: totalNewProductPurchases,
    },
    {
      name: "Reorder",
      value: totalReorderedProductPurchases,
    },
  ];

  const size = 500;
  const fourth = size / 4;
  const half = size / 2;
  const labelOffset = fourth * 1.4;
  const total = data.reduce((acc, cur) => acc + cur.value, 0);
  const container = d3.select("svg#reordered-products");

  const chart = container.attr("viewBox", `0 0 ${size} ${size}`);

  const plotArea = chart
    .append("g")
    .attr("transform", `translate(${half}, ${half})`);

  const color = d3
    .scaleOrdinal()
    .domain(data.map((d) => d.name))
    .range(d3.schemeAccent);

  const pie = d3
    .pie()
    .sort(null)
    .value((d) => d.value);

  const arcs = pie(data);

  const arc = d3.arc().innerRadius(0).outerRadius(fourth);

  const arcLabel = d3.arc().innerRadius(labelOffset).outerRadius(labelOffset);

  plotArea
    .selectAll("path")
    .data(arcs)
    .enter()
    .append("path")
    .attr("fill", (d) => color(d.data.name))
    .attr("stroke", "white")
    .attr("d", arc);

  const labels = plotArea
    .selectAll("text")
    .data(arcs)
    .enter()
    .append("text")
    .style("text-anchor", "middle")
    .style("alignment-baseline", "middle")
    .style("font-size", "16px")
    .style("fill", "#888")
    .attr("transform", (d) => `translate(${arcLabel.centroid(d)})`);

  labels
    .append("tspan")
    .attr("y", "-0.6em")
    .attr("x", 0)
    .style("font-weight", "bold")
    .text((d) => `${d.data.name}`);

  labels
    .append("tspan")
    .attr("y", "0.6em")
    .attr("x", 0)
    .text(
      (d) => `${d.data.value} (${Math.round((d.data.value / total) * 100)}%)`
    );
};
const generateMedianTimeOrder = (orderByHourCount) => {
  const data = Object.entries(orderByHourCount);

  const margin = { top: 20, right: 20, bottom: 40, left: 70 },
    width = 950 - margin.left - margin.right,
    height = 400 - margin.top - margin.bottom;

  const x = d3
    .scaleLinear()
    .domain([
      0,
      d3.max(data, function ([hour, value]) {
        return +hour;
      }),
    ])
    .range([0, width]);

  const y = d3
    .scaleLinear()
    .domain([
      0,
      d3.max(data, function ([hour, value]) {
        return value;
      }),
    ])
    .range([height, 0]);

  const tickLabels = ["Sun", "Mon", "Tues", "Wed", "Thurs", "Fri", "Sat"];
  const xAxis = d3
    .axisBottom()
    .scale(x)
    .ticks(7)
    .tickValues([0, 1, 2, 3, 4, 5, 6].map((dow) => dow * 24))
    .tickFormat((d, i) => tickLabels[i]);

  const yAxis = d3.axisLeft().scale(y);

  const area = d3
    .area()
    .x(function ([hour, value]) {
      return x(hour);
    })
    .y0(height)
    .y1(function ([hour, value]) {
      return y(value);
    });

  const svg = d3
    .select("svg#order-hour-day")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  svg
    .append("path")
    .datum(data)
    .attr("fill", "#69b3a2")
    .attr("class", "area")
    .attr("d", area);

  svg
    .append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0," + height + ")")
    .call(xAxis);

  svg.append("g").attr("class", "y axis").call(yAxis);

  svg.append("line").classed("hoverLine", true);
  svg.append("circle").classed("hoverPoint", true);
  svg
    .append("text")
    .classed("hoverText", true)
    .style("font-size", "16px")
    .attr("fill", "#888");

  svg
    .append("text")
    .attr("class", "x label")
    .attr("text-anchor", "middle")
    .attr("x", width / 2)
    .attr("y", height + 35)
    .text("Day of Week")
    .style("fill", "#888")
    .style("font-size", "14px");

  svg
    .append("text")
    .attr("class", "y label")
    .attr("text-anchor", "middle")
    .attr("y", -50)
    .attr("x", -(height / 2))
    .attr("dy", ".75em")
    .attr("transform", "rotate(-90)")
    .text("Frequency of Orders")
    .style("fill", "#888")
    .style("font-size", "14px");

  // Hover callback function
  const mouseMove = (event) => {
    event.preventDefault();
    const mouse = d3.pointer(event);
    const [xCoord, yCoord] = mouse;

    const mouseDate = x.invert(xCoord);

    const bisectDate = d3.bisector(([hour, value]) => +hour).right;
    const xIndex = bisectDate(data, mouseDate, 1);

    if (xIndex === undefined || mouseDate < 0) {
      return;
    }

    const mousePopulation = data[xIndex][1];

    svg
      .selectAll(".hoverLine")
      .attr("x1", x(mouseDate))
      .attr("y1", -20)
      .attr("x2", x(mouseDate))
      .attr("y2", height)
      .attr("stroke", "#888")
      .attr("fill", "#888");

    svg
      .selectAll(".hoverPoint")
      .attr("cx", x(mouseDate))
      .attr("cy", y(mousePopulation))
      .attr("r", "7")
      .attr("fill", "#888");

    const isLessThanHalf = xIndex > data.length / 2;
    const hoverTextX = isLessThanHalf ? "-0.75em" : "0.75em";
    const hoverTextAnchor = isLessThanHalf ? "end" : "start";

    const twentyFourHourTime = Math.floor(mouseDate) % 24;
    let timeString = "";
    if (twentyFourHourTime === 12) {
      timeString = "12:00 PM";
    } else if (twentyFourHourTime > 12) {
      timeString = `${twentyFourHourTime - 12}:00 PM`;
    } else if (twentyFourHourTime === 0) {
      timeString = "12:00 AM";
    } else {
      timeString = `${twentyFourHourTime}:00 AM`;
    }

    svg
      .selectAll(".hoverText")
      .attr("x", x(mouseDate))
      .attr("y", 0)
      .attr("dx", hoverTextX)
      .attr("dy", "-.5em")
      .style("text-anchor", hoverTextAnchor)
      .text(
        `${mousePopulation} order${
          mousePopulation !== 1 ? "s" : ""
        } are placed at ${timeString}`
      );
  };
  svg.on("mousemove", mouseMove);
};
const generateUserFreq = (userFreq) => {
  var margin = { top: 10, right: 30, bottom: 50, left: 80 },
    width = 600 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;

  var svg = d3
    .select("svg#user-freq")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  var x = d3.scaleLinear().domain([0, 100]).range([0, width]);
  svg
    .append("g")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x));

  var histogram = d3
    .histogram()
    .domain(x.domain()) // then the domain of the graphic
    .thresholds(x.ticks(50));
  var y = d3.scaleLinear().range([height, 0]);
  var bins = histogram(Object.values(userFreq));
  y.domain([
    0,
    d3.max(bins, function (d) {
      return d.length;
    }),
  ]); // d3.hist has to be called before the Y axis obviously
  svg.append("g").call(d3.axisLeft(y));

  // append the bar rectangles to the svg element
  svg
    .selectAll("rect")
    .data(bins)
    .enter()
    .append("rect")
    .attr("x", 1)
    .attr("transform", function (d) {
      return "translate(" + x(d.x0) + "," + y(d.length) + ")";
    })
    .attr("width", function (d) {
      return Math.max(0, x(d.x1) - x(d.x0) - 1);
    })
    .attr("height", function (d) {
      return height - y(d.length);
    })
    .style("fill", "#7fc97f");
  svg
    .append("text")
    .attr("class", "x label")
    .attr("text-anchor", "middle")
    .attr("x", width / 2)
    .attr("y", height + 45)
    .text("Number of Orders")
    .style("fill", "#888")
    .style("font-size", "14px");

  svg
    .append("text")
    .attr("class", "y label")
    .attr("text-anchor", "middle")
    .attr("y", -60)
    .attr("x", -(height / 2))
    .attr("dy", ".75em")
    .attr("transform", "rotate(-90)")
    .text("Number of Users")
    .style("fill", "#888")
    .style("font-size", "14px");
};
const generateFirstInCart = (
  productOrderCount,
  productNames,
  productFirstInCartCount
) => {
  // [[id, ratio]]
  const productFirstInCartRatios = Object.entries(
    productFirstInCartCount
  ).map(([id, count]) => [
    id,
    productOrderCount[id] > 10 ? count / productOrderCount[id] : 0,
  ]);

  const topTenProducts = productFirstInCartRatios
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id, count]) => [productNames[id], count]);

  const margin = { top: 30, right: 30, bottom: 170, left: 80 },
    width = 560 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;

  const svg = d3
    .select("svg#first-in-cart")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  var x = d3
    .scaleBand()
    .range([0, width])
    .domain(topTenProducts.map(([name, value]) => name))
    .padding(0.2);
  svg
    .append("g")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("transform", "translate(-10,0)rotate(-45)")
    .style("text-anchor", "end")
    .style("font-size", "14px");

  var y = d3.scaleLinear().domain([0, 1]).range([height, 0]);
  svg.append("g").call(d3.axisLeft(y));

  // Bars
  svg
    .selectAll("rect")
    .data(topTenProducts)
    .enter()
    .append("rect")
    .attr("x", function ([name, count]) {
      return x(name);
    })
    .attr("y", function ([name, count]) {
      return y(count);
    })
    .attr("width", x.bandwidth())
    .attr("height", function ([name, count]) {
      return height - y(count);
    })
    .attr("fill", "#366cae");

  svg
    .append("text")
    .attr("class", "x label")
    .attr("text-anchor", "middle")
    .attr("x", width / 2)
    .attr("y", height + 160)
    .text("Product Name")
    .style("fill", "#888")
    .style("font-size", "14px");

  svg
    .append("text")
    .attr("class", "y label")
    .attr("text-anchor", "middle")
    .attr("y", -60)
    .attr("x", -(height / 2))
    .attr("dy", ".75em")
    .attr("transform", "rotate(-90)")
    .text("Percent of First Position in Cart")
    .style("fill", "#888")
    .style("font-size", "14px");
};
const main = async () => {
  // Load in data
  const orderProducts = await d3.csv("data/order_products.csv", (d) => {
    return {
      orderId: d.order_id,
      productId: d.product_id,
      addToCartOrder: d.add_to_cart_order,
      reordered: d.reordered,
    };
  });
  const aisles = await d3.csv("data/aisles.csv", (d) => {
    return {
      aisleId: d.aisle_id,
      aisle: d.aisle,
    };
  });
  const departments = await d3.csv("data/departments.csv", (d) => {
    return {
      departmentId: d.department_id,
      department: d.department,
    };
  });
  const products = await d3.csv("data/products.csv", (d) => {
    return {
      productId: d.product_id,
      productName: d.product_name,
      aisleId: d.aisle_id,
      departmentId: d.department_id,
    };
  });
  const orders = await d3.csv("data/orders.csv", (d) => {
    return {
      orderId: d.order_id,
      userId: d.user_id,
      evalSet: d.eval_set,
      orderNumber: d.order_number,
      orderDOW: +d.order_dow,
      orderHOD: +d.order_hour_of_day,
      daysSincePrior: d.days_since_prior,
    };
  });

  const {
    nodeData,
    productOrderCount,
    productNames,
    orderByHourCount,
    productReorderCount,
    totalNewProductPurchases,
    totalReorderedProductPurchases,
    userFreq,
    productFirstInCartCount,
  } = transformData(aisles, departments, orderProducts, products, orders);

  const sunburst = generateSunburst(nodeData);
  sunburst.element.addEventListener("input", (e) => {
    e.detail && generateBreadcrumbs(e.detail);
  });
  sunburst.element.addEventListener("clean", () => {
    cleanBreadcrumbs();
  });

  generatePopularProducts(productOrderCount, productNames);

  generateMedianTimeOrder(orderByHourCount);

  generateReorderedProducts(
    totalNewProductPurchases,
    totalReorderedProductPurchases
  );

  // generateClusterWordCloud();
  generateUserFreq(userFreq);
  generateFirstInCart(productOrderCount, productNames, productFirstInCartCount);
};

main();
